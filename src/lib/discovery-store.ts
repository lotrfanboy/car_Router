import { db } from "./db";
import { createHash } from "node:crypto";
import {
  eligibility,
  normalized,
  searchSchema,
  type SearchCriteria,
  type SearchResult,
  type Source,
} from "./discovery";
import { fetchSource, providerConfig } from "./discovery-providers";
import { enrichResult } from "./listings-store";

export class SearchError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const dailyLimit = 10;
const trialLimit = { gecko: 20, reef: 40 };
export async function reserveCredits(provider: string, credits: number) {
  if (!(provider in trialLimit) || credits < 1)
    throw new SearchError("Orçamento inválido.");
  await db.$transaction(async (tx) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const [today, all] = await Promise.all([
      tx.providerSpend.aggregate({
        where: { provider, createdAt: { gte: day } },
        _sum: { credits: true },
      }),
      tx.providerSpend.aggregate({
        where: { provider },
        _sum: { credits: true },
      }),
    ]);
    if (
      (today._sum.credits ?? 0) + credits > dailyLimit ||
      (all._sum.credits ?? 0) + credits >
        trialLimit[provider as keyof typeof trialLimit]
    )
      throw new SearchError(
        "Orçamento gratuito local atingido. Nenhuma recarga será feita.",
        429,
      );
    // Count even ambiguous failures conservatively: a timeout may still have been billed upstream.
    await tx.providerSpend.create({ data: { provider, credits } });
  });
}
export async function integrationStatus() {
  const runs = await db.searchRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { createdAt: true, result: true },
  });
  return Promise.all(
    (["olx", "webmotors"] as Source[]).map(async (source) => {
      const { configured, cost, provider, configurationMessage } =
        providerConfig(source);
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      const spent = await db.providerSpend.aggregate({
        where: { provider, createdAt: { gte: day } },
        _sum: { credits: true },
      });
      const attempts = runs.flatMap((run) => {
        try {
          const result = JSON.parse(run.result) as SearchResult & {
            interrupted?: boolean;
          };
          return (result.sources ?? [])
            .filter((item) => item.source === source)
            .map((item) => ({ ...item, runAt: run.createdAt }));
        } catch {
          return [];
        }
      });
      const latest = attempts[0];
      const successful = attempts.find((item) => item.status === "ok");
      return {
        source,
        configured,
        configurationMessage,
        cost,
        reservedToday: spent._sum.credits ?? 0,
        dailyLimit,
        lastAttemptAt: latest?.runAt ?? null,
        lastAttemptStatus: latest?.status ?? null,
        lastSuccessfulAt: successful?.runAt ?? null,
      };
    }),
  );
}
export async function listSearches() {
  const rows = await db.savedSearch.findMany({
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      criteria: JSON.parse(row.criteria),
      latest: row.runs[0]
        ? {
            id: row.runs[0].id,
            createdAt: row.runs[0].createdAt,
            ...(await enrichResult(JSON.parse(row.runs[0].result))),
          }
        : null,
    })),
  );
}
export function referenceCriteria(criteria: SearchCriteria): SearchCriteria {
  let olxUrl = criteria.olxUrl;
  if (olxUrl) {
    const url = new URL(olxUrl);
    for (const key of [
      "pe",
      "ps",
      "price_max",
      "price_min",
      "priceMax",
      "priceMin",
    ])
      url.searchParams.delete(key);
    olxUrl = url.toString();
  }
  return {
    ...criteria,
    priceMax: null,
    mileageMax: null,
    privateOnly: false,
    olxUrl,
    yearMin:
      criteria.yearMin === null ? null : Math.max(1900, criteria.yearMin - 1),
    yearMax:
      criteria.yearMax === null ? null : Math.min(2100, criteria.yearMax + 1),
  };
}
function criteriaKey(criteria: SearchCriteria) {
  const canonical = {
    ...criteria,
    name: "",
    brand: normalized(criteria.brand),
    model: normalized(criteria.model),
    version: normalized(criteria.version ?? ""),
    city: normalized(criteria.city),
    sources: [...criteria.sources].sort(),
  };
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(canonical).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
    .digest("hex");
}
export async function saveSearch(input: unknown) {
  const data = searchSchema.parse(input);
  const queryKey = criteriaKey(data);
  const existing = await db.savedSearch.findUnique({ where: { queryKey } });
  if (existing) return existing;
  // Adopt a matching legacy search rather than orphaning its run history on first use.
  const legacy = await db.savedSearch.findMany({ where: { queryKey: null } });
  for (const row of legacy) {
    try {
      const parsed = searchSchema.safeParse(JSON.parse(row.criteria));
      if (parsed.success && criteriaKey(parsed.data) === queryKey)
        return await db.savedSearch.update({
          where: { id: row.id },
          data: { queryKey },
        });
    } catch {
      /* Preserve unreadable legacy records without rewriting them. */
    }
  }
  if ((await db.savedSearch.count()) >= 30)
    throw new SearchError("Limite de 30 buscas salvas neste MVP.");
  return db.savedSearch.upsert({
    where: { queryKey },
    update: {},
    create: { name: data.name, criteria: JSON.stringify(data), queryKey },
  });
}
export async function executeSearch(
  id: string,
  options: { reuseRecent?: boolean } = {},
) {
  const search = await db.savedSearch.findUnique({ where: { id } });
  if (!search) throw new SearchError("Busca não encontrada.", 404);
  const criteria = searchSchema.parse(JSON.parse(search.criteria));
  if (!criteria.sources.some((source) => providerConfig(source).configured))
    throw new SearchError(
      "Nenhuma fonte selecionada está configurada. Revise as integrações antes de consultar.",
      409,
    );
  const last = await db.searchRun.findFirst({
    where: { searchId: id },
    orderBy: { createdAt: "desc" },
  });
  if (
    last &&
    Date.now() - last.createdAt.getTime() < 60000 &&
    options.reuseRecent
  ) {
    const result = JSON.parse(last.result) as SearchResult & {
      interrupted?: boolean;
    };
    if (!result.interrupted && result.sources.length)
      return {
        id: last.id,
        createdAt: last.createdAt,
        ...(await enrichResult(result)),
        cached: true,
      };
  }
  if (last && Date.now() - last.createdAt.getTime() < 60000)
    throw new SearchError(
      "Aguarde um minuto entre consultas da mesma busca.",
      429,
    );
  const expiresAt = new Date(Date.now() + 600000);
  try {
    await db.$transaction(async (tx) => {
      await tx.searchLock.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      await tx.searchLock.create({
        data: { id: "manual-search", expiresAt },
      });
    });
  } catch {
    throw new SearchError("Aguarde: outra consulta está em andamento.", 409);
  }
  try {
    // Recheck after acquiring the shared lock, including requests that waited on SQLite.
    const recent = await db.searchRun.findFirst({
      where: { searchId: id },
      orderBy: { createdAt: "desc" },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < 60000)
      throw new SearchError(
        "Aguarde um minuto entre consultas da mesma busca.",
        429,
      );
    const run = await db.searchRun.create({
      data: {
        searchId: id,
        result: JSON.stringify({ sources: [], interrupted: true }),
      },
    });
    const reference = referenceCriteria(criteria),
      cacheKey = criteriaKey(reference);
    const cached = await db.searchCache.findUnique({ where: { id: cacheKey } });
    if (cached && Date.now() - cached.updatedAt.getTime() < 60000) {
      const result: SearchResult = JSON.parse(cached.result);
      result.sources = result.sources.map((source) => ({
        ...source,
        creditsReserved: 0,
        locationCredits: 0,
        listings: source.listings.map((row) => ({
          ...row,
          reasons: eligibility(row, criteria),
        })),
      }));
      await db.searchRun.update({
        where: { id: run.id },
        data: { result: JSON.stringify(result) },
      });
      return {
        id: run.id,
        createdAt: run.createdAt,
        ...(await enrichResult(result)),
        cached: true,
      };
    }
    const result: SearchResult = { sources: [] };
    // Sequential calls keep the spend and each partial failure understandable.
    for (const source of criteria.sources)
      result.sources.push(await fetchSource(source, reference, reserveCredits));
    for (const source of result.sources)
      for (const row of source.listings)
        row.reasons = eligibility(row, criteria);
    await db.$transaction(
      async (tx) => {
        for (const source of result.sources)
          for (const row of source.listings) {
            const previous = await tx.discoveredListing.findUnique({
              where: {
                source_externalId: {
                  source: row.source,
                  externalId: row.externalId,
                },
              },
              include: { prices: { orderBy: { id: "desc" }, take: 1 } },
            });
            row.isNew = !previous;
            row.previousPriceCents = previous?.prices[0]?.priceCents ?? null;
            const saved = await tx.discoveredListing.upsert({
              where: {
                source_externalId: {
                  source: row.source,
                  externalId: row.externalId,
                },
              },
              create: {
                source: row.source,
                externalId: row.externalId,
                payload: JSON.stringify(row),
                lastSeen: new Date(row.observedAt),
              },
              update: {
                payload: JSON.stringify(row),
                lastSeen: new Date(row.observedAt),
              },
            });
            if (
              row.priceCents !== null &&
              row.priceCents !== row.previousPriceCents
            )
              await tx.listingPrice.create({
                data: {
                  listingId: saved.id,
                  priceCents: row.priceCents,
                  observedAt: new Date(row.observedAt),
                },
              });
          }
        await tx.searchRun.update({
          where: { id: run.id },
          data: { result: JSON.stringify(result) },
        });
        if (result.sources.some((source) => source.status === "ok"))
          await tx.searchCache.upsert({
            where: { id: cacheKey },
            create: { id: cacheKey, result: JSON.stringify(result) },
            update: { result: JSON.stringify(result), updatedAt: new Date() },
          });
      },
      { timeout: 20000 },
    );
    return {
      id: run.id,
      createdAt: run.createdAt,
      ...(await enrichResult(result)),
    };
  } finally {
    await db.searchLock.deleteMany({
      where: { id: "manual-search", expiresAt },
    });
  }
}
