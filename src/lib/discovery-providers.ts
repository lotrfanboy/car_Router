import { existsSync, readFileSync } from "node:fs";
import { catalogBrandSearchName, catalogModelFamily } from "./vehicle-catalog";
import {
  buildOlxUrl,
  locationKey,
  regionCandidates,
  verifiedRegions,
} from "./olx-search";
import {
  eligibility,
  normalized,
  publicListingUrl,
  type Listing,
  type SearchCriteria,
  type Source,
  type SourceResult,
} from "./discovery";

type Row = Record<string, unknown>;
const obj = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const photoUrl = (v: unknown) => {
  const value = str(v);
  try {
    const url = new URL(value!);
    return url.protocol === "https:" && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
};
// Gecko's OLX payload carries the listing's own photos in images[].
// Keep only a URL actually supplied with this listing.
const listingPhoto = (row: Row) => {
  const images = Array.isArray(row.images) ? row.images : [];
  return (
    photoUrl(row.image_url) ??
    images
      .map((value) => {
        const image = obj(value);
        return photoUrl(image.url) ?? photoUrl(image.webpUrl);
      })
      .find((value) => value !== null) ??
    null
  );
};
const num = (v: unknown) =>
  (typeof v === "number" || typeof v === "string") &&
  v !== "" &&
  Number.isFinite(Number(v)) &&
  Number(v) >= 0
    ? Number(v)
    : null;
const integer = (v: unknown) => {
  const n = num(v);
  return n !== null && Number.isSafeInteger(n) ? n : null;
};
const price = (v: unknown) => {
  const n = num(v);
  return n !== null && n > 0 && n <= 20000000 ? Math.round(n * 100) : null;
};
export const providerFor = (source: Source) =>
  source === "olx" ? "gecko" : "reef";
export function secret(name: string, file: string) {
  if (process.env[name]) return process.env[name]!.trim();
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((x) => x.startsWith(`${name}=`));
  return (line?.slice(name.length + 1) ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}
export function providerConfig(source: Source) {
  const gecko = source === "olx";
  const key = secret(
    gecko ? "GECKO_API_KEY" : "REEF_API_KEY",
    gecko ? ".env.gecko.local" : ".env.reef.local",
  );
  // Reef has no account-free-balance endpoint established by our proof. Explicit local opt-in is required.
  const enabled =
    gecko ||
    secret("REEF_FREE_TRIAL", ".env.reef.local").toLowerCase() === "true";
  return {
    key,
    configured: Boolean(key) && enabled,
    cost: gecko ? 1 : 2,
    provider: gecko ? "gecko" : "reef",
    configurationMessage: !key
      ? `Chave ${gecko ? "Gecko" : "Reef"} não configurada no servidor.`
      : !enabled
        ? "Chave Reef presente; falta confirmar créditos promocionais e habilitar REEF_FREE_TRIAL."
        : "Credencial presente; a conexão será verificada ao consultar.",
  };
}
export async function providerJson(
  url: string,
  key: string,
  body?: unknown,
  reef = false,
): Promise<Row> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      [reef ? "x-api-key" : "Authorization"]: reef ? key : `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
    redirect: "error",
    cache: "no-store",
  });
  // Never include a provider response, URL with credentials, or exception in a public error.
  if (!response.ok)
    throw new Error(
      response.status === 402
        ? "Créditos insuficientes. Nenhuma recarga foi feita."
        : response.status === 429
          ? "Limite do fornecedor atingido. Aguarde antes de consultar."
          : `Fornecedor indisponível (HTTP ${response.status}).`,
    );
  return obj(await response.json());
}
export async function checkGecko(key: string) {
  const balance = await providerJson(
    "https://api.geckoapi.com.br/v1/me/credits",
    key,
  );
  if (
    balance.planId !== "free" ||
    typeof balance.currentCredits !== "number" ||
    balance.currentCredits < 1 ||
    balance.currentCredits > 100
  )
    throw new Error(
      "Consulta suspensa: confirme o saldo do plano gratuito Gecko.",
    );
  const catalog = await providerJson(
    "https://api.geckoapi.com.br/v1/mcp",
    key,
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
  );
  const tools = obj(catalog.result).tools;
  const tool = Array.isArray(tools)
    ? tools.map(obj).find((t) => t.name === "olx_com_br_plp")
    : null;
  if (!/Current cost: 1 credit\./.test(String(tool?.description)))
    throw new Error(
      "Custo OLX mudou ou não pôde ser confirmado. Consulta suspensa.",
    );
}

export function normalizeOlx(value: unknown, observedAt: string): Listing[] {
  const data = obj(value);
  if (!Array.isArray(data.items))
    throw new Error("A OLX retornou um formato inesperado.");
  return data.items.slice(0, 100).flatMap((raw) => {
    const r = obj(raw),
      loc = obj(r.location);
    const url = str(r.url),
      id = str(r.id) ?? (integer(r.id) !== null ? String(r.id) : null);
    if (!id || !url || !publicListingUrl(url, "olx")) return [];
    const attrs: Record<string, string> = {};
    if (Array.isArray(r.properties))
      for (const item of r.properties) {
        const p = obj(item);
        if (str(p.name) && str(p.value))
          attrs[String(p.name)] = String(p.value);
      }
    const sourceModel = str(attrs.vehicle_model);
    const fullModel = sourceModel?.replace(/\s+/g, " ") ?? "";
    // Shared conservative boundaries keep compound models intact. Preserve the
    // original attribute and do not claim an inferred trim is FIPE-verified.
    const model = fullModel ? catalogModelFamily(fullModel) : null;
    const explicitVersion = str(attrs.vehicle_version);
    return [
      {
        source: "olx",
        externalId: id,
        url,
        title: str(r.title) ?? "Anúncio OLX",
        brand: str(attrs.vehicle_brand),
        model,
        sourceModel,
        version:
          explicitVersion ??
          (model && fullModel.length > model.length
            ? fullModel.slice(model.length).trim()
            : null),
        versionOrigin: explicitVersion
          ? "explicit"
          : fullModel.length > (model?.length ?? 0)
            ? "inferred"
            : "unknown",
        fuel: str(attrs.fuel),
        transmission: str(attrs.gearbox),
        engine: str(attrs.motorpower),
        imageUrl: listingPhoto(r),
        modelYear: integer(attrs.regdate),
        priceCents: price(r.price),
        mileage: integer(attrs.mileage),
        city: str(loc.city),
        state: str(loc.state)?.toUpperCase() ?? null,
        sellerType:
          r.professionalAd === true
            ? "professional"
            : r.professionalAd === false
              ? "private"
              : "unknown",
        observedAt,
        reasons: [],
      },
    ];
  });
}
export function normalizeReef(value: unknown, observedAt: string): Listing[] {
  const data = obj(value);
  if (!Array.isArray(data.listings))
    throw new Error("A Webmotors retornou um formato inesperado.");
  return data.listings.slice(0, 100).flatMap((raw) => {
    const r = obj(raw),
      seller = obj(r.seller),
      id = integer(r.listing_id),
      url = str(r.url);
    if (id === null || !url || !publicListingUrl(url, "webmotors")) return [];
    return [
      {
        source: "webmotors",
        externalId: String(id),
        url,
        title: str(r.title) ?? "Anúncio Webmotors",
        brand: str(r.make),
        model: str(r.model),
        sourceModel: str(r.model),
        version: str(r.version),
        versionOrigin: str(r.version) ? "explicit" : "unknown",
        fuel: str(r.fuel),
        transmission: str(r.transmission),
        engine: str(r.engine),
        imageUrl: photoUrl(r.image_url),
        modelYear: integer(r.year_model),
        priceCents: price(r.price),
        mileage: integer(r.mileage_km),
        city: str(seller.city),
        state: str(seller.state_code)?.toUpperCase() ?? null,
        sellerType:
          seller.type === "private"
            ? "private"
            : ["dealer", "dealership"].includes(String(seller.type))
              ? "professional"
              : "unknown",
        observedAt,
        reasons: [],
      },
    ];
  });
}
export async function fetchSource(
  source: Source,
  criteria: SearchCriteria,
  reserve: (provider: string, credits: number) => Promise<void>,
): Promise<SourceResult> {
  const start = performance.now(),
    observedAt = new Date().toISOString(),
    config = providerConfig(source);
  const result: SourceResult = {
    source,
    status: "ok",
    message: "",
    observedAt,
    elapsedMs: 0,
    creditsReserved: 0,
    total: null,
    partial: true,
    listings: [],
  };
  if (!config.configured)
    return {
      ...result,
      status: "unconfigured",
      message: config.configurationMessage,
    };
  try {
    const { db } = await import("./db");
    if (source === "olx") await checkGecko(config.key);
    let olxUrl = criteria.olxUrl;
    let resolvedRegion: string | null = null;
    let needsVerification = false;
    if (source === "olx" && !olxUrl) {
      const key = locationKey(criteria);
      const cached = await db.olxLocation.findUnique({ where: { id: key } });
      resolvedRegion =
        verifiedRegions[key] ??
        (cached && Date.now() - cached.verifiedAt.getTime() < 30 * 86400000
          ? cached.region
          : null);
      if (!resolvedRegion) {
        const reef = providerConfig("webmotors");
        if (!reef.configured)
          throw new Error(
            "Localização OLX ainda não conhecida. Conecte a conta gratuita Reef para resolvê-la automaticamente.",
          );
        await reserve("reef", 1);
        result.locationCredits = 1;
        const lookup = await providerJson(
          "https://api.reefapi.com/olx/v1/locations",
          reef.key,
          {
            country: "br",
            state: criteria.state.toLowerCase(),
            query: criteria.city,
          },
          true,
        );
        const candidates =
          lookup.ok === true ? regionCandidates(lookup.data) : [];
        if (candidates.length !== 1)
          throw new Error(
            "Localização OLX não pôde ser resolvida com segurança nesta cidade. A outra fonte pode continuar funcionando.",
          );
        resolvedRegion = candidates[0];
        needsVerification = true;
      }
      olxUrl = buildOlxUrl(criteria, resolvedRegion);
    }
    await reserve(config.provider, config.cost);
    result.creditsReserved = config.cost;
    const payload =
      source === "olx"
        ? await providerJson(
            "https://api.geckoapi.com.br/v1/extract",
            config.key,
            { target: "olx.com.br", type: "plp", url: olxUrl },
          )
        : await providerJson(
            "https://api.reefapi.com/webmotors/v1/search",
            config.key,
            {
              make: catalogBrandSearchName(criteria.brand),
              model: criteria.model,
              location: `${criteria.state.toLowerCase()}-${normalized(criteria.city).replaceAll(" ", "-")}`,
              ...(criteria.yearMin !== null
                ? { year_min: criteria.yearMin }
                : {}),
              ...(criteria.yearMax !== null
                ? { year_max: criteria.yearMax }
                : {}),
              ...(criteria.priceMax !== null
                ? { price_max: criteria.priceMax }
                : {}),
              ...(criteria.mileageMax !== null
                ? { mileage_max: criteria.mileageMax }
                : {}),
              ...(criteria.privateOnly ? { seller_type: "private" } : {}),
              page: 1,
              page_size: 24,
            },
            true,
          );
    if (source === "webmotors" && payload.ok !== true)
      throw new Error(
        "Webmotors não concluiu a coleta. Nenhum resultado anterior foi apagado.",
      );
    const data = obj(payload.data);
    result.total = integer(
      source === "olx" ? data.totalResults : data.total_results,
    );
    result.listings =
      source === "olx"
        ? normalizeOlx(data, observedAt)
        : normalizeReef(data, observedAt);
    if (source === "olx" && !criteria.olxUrl) {
      if (
        result.listings.some((row) => row.state && row.state !== criteria.state)
      ) {
        result.listings = [];
        throw new Error(
          "Localização OLX divergente: a fonte ampliou a região. Resultados descartados para não misturar estados.",
        );
      }
      if (needsVerification) {
        if (
          !result.listings.some(
            (row) =>
              row.city &&
              normalized(row.city) === normalized(criteria.city) &&
              row.state === criteria.state,
          )
        ) {
          result.listings = [];
          throw new Error(
            "Localização OLX ainda não confirmada pelos resultados. Não vou apresentar uma busca nacional como se fosse da sua cidade.",
          );
        }
        await db.olxLocation.upsert({
          where: { id: locationKey(criteria) },
          create: { id: locationKey(criteria), region: resolvedRegion! },
          update: { region: resolvedRegion!, verifiedAt: new Date() },
        });
      }
    }
    result.listings = [
      ...new Map(result.listings.map((row) => [row.externalId, row])).values(),
    ].map((row) => ({ ...row, reasons: eligibility(row, criteria) }));
    result.partial =
      source === "olx"
        ? Boolean(data.nextPageUrl) ||
          result.total === null ||
          result.total > result.listings.length
        : data.has_more !== false ||
          (result.total !== null && result.total > result.listings.length);
    result.message = result.partial
      ? "Uma página consultada. Há cobertura parcial; consulte a origem para ver mais anúncios."
      : "Todos os resultados declarados para este recorte foram recebidos.";
  } catch (error) {
    result.status = "error";
    result.message =
      error instanceof Error &&
      /^(Localização|Fornecedor|Créditos|Limite|Consulta|Custo|A OLX|A Webmotors|Webmotors|Orçamento|Aguarde)/.test(
        error.message,
      )
        ? error.message
        : "Falha na consulta. Tente novamente mais tarde; não houve repetição automática.";
  }
  result.elapsedMs = Math.round(performance.now() - start);
  return result;
}
