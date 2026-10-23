import { db } from "./db";
import { collectionCriteria } from "./search-criteria";
import { commercialModelName } from "./commercial-names";
import { planSourceQuery } from "./source-query";
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
import {
  enrichResult,
  createEnrichmentContext,
  type EnrichmentContext,
} from "./listings-store";
import { readVehicleCatalog } from "./catalog-store";
import { catalogKey, type VehicleCatalog } from "./vehicle-catalog";
import {
  normalizeCatalogCriteria,
  validCatalogCriteria,
} from "./commercial-models";

export async function currentSearchCriteria(
  input: unknown,
  catalog?: VehicleCatalog,
): Promise<SearchCriteria> {
  const criteria = collectionCriteria(searchSchema.parse(input));
  const activeCatalog = catalog ?? (await readVehicleCatalog());
  if (criteria.catalog?.provider === "carrouter" && criteria.catalog.modelCode)
    return collectionCriteria(
      normalizeCatalogCriteria(activeCatalog, criteria),
    );
  // Manual and FIPE-era saved names must use the same canonical family for
  // both collection and local classification. Only an unambiguous native
  // contract or an explicitly reviewed alias can establish that selection.
  const plan = planSourceQuery(activeCatalog, "webmotors", {
    ...criteria,
    model: commercialModelName(criteria.brand, criteria.model),
  });
  return plan.mapping.status === "confirmed" ? plan.criteria : criteria;
}

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
// The catalog verification was a bounded one-off batch. Give interactive
// searches a small, dated allowance without reopening scheduled radar spend.
const validationBatch = "search-catalog-20261023";
const manualSupplement = { gecko: 2, reef: 4 };
type BudgetScope = "manual" | "scheduled";
const validationCreditsToday = async (
  tx: Pick<typeof db, "providerOperation">,
  provider: keyof typeof trialLimit,
  day: Date,
) => {
  const validation = await tx.providerOperation.aggregate({
    where: {
      batchId: validationBatch,
      provider,
      status: "succeeded",
      completedAt: { gte: day },
    },
    _sum: { credits: true },
  });
  return validation._sum.credits ?? 0;
};
export async function reserveCredits(
  provider: string,
  credits: number,
  scope: BudgetScope = "manual",
) {
  if (!(provider in trialLimit) || credits < 1)
    throw new SearchError("Orçamento inválido.");
  await db.$transaction(async (tx) => {
    // The upsert takes a row lock for the transaction. PostgreSQL can otherwise
    // let concurrent requests both pass the aggregate checks before inserting.
    await tx.searchLock.upsert({
      where: { id: `provider-budget:${provider}` },
      create: {
        id: `provider-budget:${provider}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
      update: { expiresAt: new Date(Date.now() + 86400000) },
    });
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
    const verified = await validationCreditsToday(
      tx,
      provider as keyof typeof trialLimit,
      day,
    );
    const ordinaryToday = Math.max(0, (today._sum.credits ?? 0) - verified);
    const extra =
      scope === "manual" && verified > 0
        ? manualSupplement[provider as keyof typeof trialLimit]
        : 0;
    if (
      ordinaryToday + credits > dailyLimit + extra ||
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
      const verified = await validationCreditsToday(
        db,
        provider as keyof typeof trialLimit,
        day,
      );
      const extra = verified
        ? manualSupplement[provider as keyof typeof trialLimit]
        : 0;
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
        reservedToday: Math.max(0, (spent._sum.credits ?? 0) - verified),
        dailyLimit: dailyLimit + extra,
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
    include: {
      runs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
    },
  });
  if (!rows.length) return [];
  const context = await createEnrichmentContext();
  return Promise.all(
    rows.map(async (row) => {
      const originalCriteria = JSON.parse(row.criteria) as SearchCriteria;
      const criteria = await currentSearchCriteria(
        originalCriteria,
        context.catalog,
      );
      const criteriaMigrationNotice =
        originalCriteria.model !== criteria.model ||
        originalCriteria.catalog?.modelCode !== criteria.catalog?.modelCode ||
        originalCriteria.version ||
        originalCriteria.doors ||
        originalCriteria.olxUrl ||
        (originalCriteria.catalog?.provider === "carrouter" &&
          (originalCriteria.catalog.versionCode ||
            originalCriteria.catalog.configurationCode))
          ? "Esta busca agora coleta todo o modelo. Resultados antigos mantêm o recorte da coleta original; execute novamente para ampliar. Refine a versão nos resultados."
          : undefined;
      const latest = row.runs[0]
        ? {
            id: row.runs[0].id,
            createdAt: row.runs[0].createdAt,
            ...(await enrichResult(
              JSON.parse(row.runs[0].result) as SearchResult & {
                interrupted?: boolean;
              },
              criteria,
              context,
            )),
          }
        : null;
      const failedSources =
        latest?.sources
          .filter((source) => source.status !== "ok")
          .map((source) => source.source) ?? [];
      const hasCurrentSuccess =
        latest?.sources.some((source) => source.status === "ok") ?? false;
      // Keep failures and prior observations separate. With a partial failure,
      // recover the failed source rather than the most recent successful source.
      const partialFailure = !latest?.interrupted && hasCurrentSuccess;
      const history =
        latest &&
        (latest.interrupted || !hasCurrentSuccess || failedSources.length > 0)
          ? await recoverSearchRuns(
              row.id,
              latest.id,
              partialFailure
                ? failedSources
                : [...new Set([...criteria.sources, ...failedSources])],
              partialFailure ? failedSources : [],
              criteria,
              context,
            )
          : { lastSuccessful: null, previousSourceRuns: [] };
      return {
        id: row.id,
        criteria,
        criteriaMigrationNotice,
        latest,
        ...history,
      };
    }),
  );
}

type HistoricalRun = SearchResult & {
  id: string;
  createdAt: Date;
  interrupted?: boolean;
};

async function recoverSearchRuns(
  searchId: string,
  latestId: string,
  recoverySources: Source[],
  lastSuccessfulSources: Source[],
  criteria: SearchCriteria,
  context: EnrichmentContext,
) {
  let cursor = latestId;
  let lastSuccessful: HistoricalRun | null = null;
  const previousSourceRuns: HistoricalRun[] = [];
  const missingSources = new Set(recoverySources);
  // Scan in small batches, preserving every historical record and its dates.
  for (;;) {
    const runs = await db.searchRun.findMany({
      where: { searchId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: cursor },
      skip: 1,
      take: 20,
    });
    for (const run of runs) {
      try {
        const result = JSON.parse(run.result) as SearchResult & {
          interrupted?: boolean;
        };
        const successfulSources = result.sources
          .filter((source) => source.status === "ok")
          .map((source) => source.source);
        if (result.interrupted || !successfulSources.length) continue;
        const isLastSuccessful =
          !lastSuccessful &&
          lastSuccessfulSources.every((source) =>
            successfulSources.includes(source),
          );
        const recoveredSources = successfulSources.filter((source) =>
          missingSources.has(source),
        );
        if (isLastSuccessful || recoveredSources.length) {
          const enriched = {
            id: run.id,
            createdAt: run.createdAt,
            ...(await enrichResult(result, criteria, context)),
          };
          if (isLastSuccessful) lastSuccessful = enriched;
          if (recoveredSources.length) {
            // One group per historical execution, with only the newest success
            // for each requested source. Do not mix it into current results.
            previousSourceRuns.push({
              ...enriched,
              sources: enriched.sources.filter(
                (source) =>
                  source.status === "ok" &&
                  recoveredSources.includes(source.source),
              ),
            });
            for (const source of recoveredSources)
              missingSources.delete(source);
          }
        }
        if (lastSuccessful && !missingSources.size)
          return { lastSuccessful, previousSourceRuns };
      } catch {
        // A malformed old record must not hide earlier readable observations.
      }
    }
    if (runs.length < 20) return { lastSuccessful, previousSourceRuns };
    cursor = runs[runs.length - 1].id;
  }
}
/** Collection honors the requested scope. Comparables use already persisted observations. */
export function referenceCriteria(criteria: SearchCriteria): SearchCriteria {
  return collectionCriteria(criteria);
}
function criteriaKey(
  criteria: SearchCriteria,
  collection = false,
  legacyLocation = false,
  searchRevision = "",
) {
  criteria = collectionCriteria(criteria);
  const locationFields: Partial<SearchCriteria> = { ...criteria };
  if (legacyLocation) {
    delete locationFields.locationMode;
    delete locationFields.cities;
  }
  const canonical = {
    ...locationFields,
    // Legacy FIPE metadata did not affect the query. The new catalog's source
    // mappings do, so its identity/revision must participate in the cache key.
    ...(collection
      ? {
          catalog:
            criteria.catalog?.provider === "carrouter"
              ? criteria.catalog
              : undefined,
          collectionVersion: 5,
          searchRevision,
        }
      : {}),
    name: "",
    brand: normalized(criteria.brand),
    model: catalogKey(criteria.model),
    city: normalized(criteria.city),
    ...(legacyLocation
      ? {}
      : {
          cities: (criteria.cities.length
            ? criteria.cities
            : criteria.city
              ? [criteria.city]
              : []
          )
            .map(normalized)
            .sort(),
        }),
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
  const data = await currentSearchCriteria(input);
  if (
    data.catalog?.provider === "carrouter" &&
    !validCatalogCriteria(await readVehicleCatalog(), data)
  )
    throw new SearchError(
      "Seleção de catálogo desatualizada ou incompatível. Selecione novamente ou confirme a entrada manual.",
    );
  const queryKey = criteriaKey(data);
  const existing = await db.savedSearch.findUnique({ where: { queryKey } });
  if (existing) return existing;
  const previousKey = criteriaKey(data, false, true);
  const previous = await db.savedSearch.findUnique({
    where: { queryKey: previousKey },
  });
  if (previous) return previous;
  // Recompute persisted identities after schema evolution rather than orphaning
  // run history when a single legacy city becomes `cities: [city]`.
  const legacy = await db.savedSearch.findMany();
  for (const row of legacy) {
    try {
      const parsed = await currentSearchCriteria(JSON.parse(row.criteria));
      if (criteriaKey(parsed) === queryKey) {
        return await db.savedSearch.update({
          where: { id: row.id },
          data: { queryKey, criteria: JSON.stringify(data) },
        });
      }
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
  options: { reuseRecent?: boolean; budgetScope?: BudgetScope } = {},
) {
  const search = await db.savedSearch.findUnique({ where: { id } });
  if (!search) throw new SearchError("Busca não encontrada.", 404);
  const catalog = await readVehicleCatalog();
  const searchRevision = `${catalog.revision}:${catalog.commercialRevision ?? ""}:${catalog.searchRevision ?? ""}`;
  const criteria = await currentSearchCriteria(
    JSON.parse(search.criteria),
    catalog,
  );
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
    if (
      !result.interrupted &&
      result.sources.length &&
      result.collectionVersion === 5 &&
      result.searchRevision === searchRevision
    )
      return {
        id: last.id,
        createdAt: last.createdAt,
        ...(await enrichResult(
          {
            ...result,
            sources: result.sources.map((source) => ({
              ...source,
              creditsReserved: 0,
              locationCredits: 0,
              targets: source.targets?.map((target) => ({
                ...target,
                creditsReserved: 0,
                locationCredits: 0,
              })),
            })),
          },
          criteria,
        )),
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
      cacheKey = criteriaKey(reference, true, false, searchRevision);
    const cached = await db.searchCache.findUnique({ where: { id: cacheKey } });
    if (cached && Date.now() - cached.updatedAt.getTime() < 60000) {
      const result: SearchResult = JSON.parse(cached.result);
      result.sources = result.sources.map((source) => ({
        ...source,
        creditsReserved: 0,
        locationCredits: 0,
        targets: source.targets?.map((target) => ({
          ...target,
          creditsReserved: 0,
          locationCredits: 0,
        })),
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
        ...(await enrichResult(result, criteria)),
        cached: true,
      };
    }
    const result: SearchResult = {
      sources: [],
      collectionVersion: 5,
      searchRevision,
    };
    // Sequential calls keep the spend and each partial failure understandable.
    for (const source of criteria.sources)
      result.sources.push(
        await fetchSource(source, reference, (provider, credits) =>
          reserveCredits(provider, credits, options.budgetScope ?? "manual"),
        ),
      );
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
      ...(await enrichResult(result, criteria)),
    };
  } finally {
    await db.searchLock.deleteMany({
      where: { id: "manual-search", expiresAt },
    });
  }
}
