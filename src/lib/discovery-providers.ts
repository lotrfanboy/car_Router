import { existsSync, readFileSync } from "node:fs";
import {
  resolveCatalogVehicle,
  emptyCatalog,
  type VehicleCatalog,
} from "./vehicle-catalog";
import { readVehicleCatalog } from "./catalog-store";
import { planSourceQuery, type SourceQueryMapping } from "./source-query";
import {
  buildOlxUrl,
  buildOlxStateUrl,
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
// Preserve original vehicle fields and media for audit without seller contacts.
const originalFields = (row: Row, fields: string[]) =>
  Object.fromEntries(
    fields.filter((key) => key in row).map((key) => [key, row[key]]),
  );
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
// Reef responses have used both a primary image field and media collections.
// Read only URLs attached to the listing; never synthesize a Webmotors CDN URL.
const reefListingPhoto = (row: Row) => {
  const media = [row.images, row.photos, obj(row.media).images]
    .filter(Array.isArray)
    .flat() as unknown[];
  return (
    photoUrl(row.image_url) ??
    photoUrl(row.image) ??
    photoUrl(row.imageUrl) ??
    photoUrl(row.thumbnail_url) ??
    photoUrl(obj(row.image).url) ??
    media
      .map((value) => {
        if (typeof value === "string") return photoUrl(value);
        const image = obj(value);
        return (
          photoUrl(image.url) ??
          photoUrl(image.webpUrl) ??
          photoUrl(image.image_url) ??
          photoUrl(image.original)
        );
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

export function normalizeOlx(
  value: unknown,
  observedAt: string,
  catalog: VehicleCatalog = emptyCatalog,
): Listing[] {
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
    const explicitVersion = str(attrs.vehicle_version);
    const sourceIdentity = {
      brandId: str(attrs.vehicle_brand_id),
      modelId: str(attrs.vehicle_model_id),
      versionId: str(attrs.vehicle_version_id),
    };
    const resolved = resolveCatalogVehicle(catalog, {
      source: "olx",
      brand: str(attrs.vehicle_brand),
      model: sourceModel,
      version: explicitVersion,
      doors: integer(attrs.doors) ?? integer(attrs.vehicle_doors),
      ...sourceIdentity,
    });
    return [
      {
        source: "olx",
        externalId: id,
        url,
        title: str(r.title) ?? "Anúncio OLX",
        brand: resolved?.brand?.name ?? str(attrs.vehicle_brand),
        model: resolved?.model?.name ?? sourceModel,
        sourceModel,
        sourceIdentity,
        identity: resolved?.identity,
        doors: resolved?.doors,
        catalogResolution: resolved?.classification,
        original: {
          brand: str(attrs.vehicle_brand),
          model: sourceModel,
          version: explicitVersion,
          properties: r.properties as unknown[] | undefined,
          fields: originalFields(r, [
            "id",
            "url",
            "title",
            "price",
            "images",
            "image_url",
            "location",
            "professionalAd",
          ]),
        },
        version: resolved?.version?.name ?? explicitVersion,
        versionOrigin:
          explicitVersion || resolved?.version ? "explicit" : "unknown",
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
export function normalizeReef(
  value: unknown,
  observedAt: string,
  catalog: VehicleCatalog = emptyCatalog,
): Listing[] {
  const data = obj(value);
  if (!Array.isArray(data.listings))
    throw new Error("A Webmotors retornou um formato inesperado.");
  return data.listings.slice(0, 100).flatMap((raw) => {
    const r = obj(raw),
      seller = obj(r.seller),
      id = integer(r.listing_id),
      url = str(r.url);
    if (id === null || !url || !publicListingUrl(url, "webmotors")) return [];
    const sourceId = (value: unknown) =>
      str(value) ?? (integer(value) !== null ? String(value) : null);
    const sourceIdentity = {
      brandId: sourceId(r.make_id),
      modelId: sourceId(r.model_id),
      versionId: sourceId(r.trim_id),
    };
    const version = str(r.trim) ?? str(r.version);
    const resolved = resolveCatalogVehicle(catalog, {
      source: "webmotors",
      brand: str(r.make),
      model: str(r.model),
      version,
      doors:
        integer(r.doors) ??
        (version?.match(/\b([24])\s*P\b/i)
          ? Number(version.match(/\b([24])\s*P\b/i)![1])
          : undefined),
      ...sourceIdentity,
    });

    return [
      {
        source: "webmotors",
        externalId: String(id),
        url,
        title: str(r.title) ?? "Anúncio Webmotors",
        brand: resolved?.brand?.name ?? str(r.make),
        model: resolved?.model?.name ?? str(r.model),
        sourceModel: str(r.model),
        sourceIdentity,
        identity: resolved?.identity,
        doors: resolved?.doors,
        catalogResolution: resolved?.classification,
        original: {
          brand: str(r.make),
          model: str(r.model),
          version,
          fields: {
            ...originalFields(r, [
              "listing_id",
              "url",
              "title",
              "make_id",
              "model_id",
              "trim_id",
              "year_model",
              "year_manufacture",
              "price",
              "mileage_km",
              "fuel",
              "transmission",
              "engine",
              "engine_litres",
              "images",
              "photos",
              "media",
              "image",
              "image_url",
              "imageUrl",
              "thumbnail_url",
            ]),
            seller: originalFields(seller, ["city", "state_code", "type"]),
          },
        },
        version: resolved?.version?.name ?? version,
        versionOrigin: version || resolved?.version ? "explicit" : "unknown",
        fuel: str(r.fuel),
        transmission: str(r.transmission),
        engine: str(r.engine) ?? str(r.engine_litres),
        imageUrl: reefListingPhoto(r),
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
function emptySourceResult(source: Source): SourceResult {
  return {
    source,
    status: "ok",
    message: "",
    observedAt: new Date().toISOString(),
    elapsedMs: 0,
    creditsReserved: 0,
    total: null,
    partial: true,
    listings: [],
  };
}
function collectionError(error: unknown) {
  return error instanceof Error &&
    /^(Catálogo|Localização|Fornecedor|Créditos|Limite|Consulta|Custo|A OLX|A Webmotors|Webmotors|Orçamento|Aguarde)/.test(
      error.message,
    )
    ? error.message
    : "Falha na consulta. Tente novamente mais tarde; não houve repetição automática.";
}

/** Plan once, then execute every approved native model in each selected city. */
export async function fetchSource(
  source: Source,
  input: SearchCriteria,
  reserve: (provider: string, credits: number) => Promise<void>,
): Promise<SourceResult> {
  const start = performance.now();
  const result = emptySourceResult(source);
  const config = providerConfig(source);
  if (!config.configured)
    return {
      ...result,
      status: "unconfigured",
      message: config.configurationMessage,
    };
  try {
    const catalog = await readVehicleCatalog();
    const plan = planSourceQuery(catalog, source, input);
    const criteria = plan.criteria;
    result.applied = { remote: [], local: [], mapping: plan.mapping };
    if (!plan.queries.length) throw new Error(plan.mapping.message);
    const selectedCities = criteria.cities.length
      ? criteria.cities
      : criteria.city
        ? [criteria.city]
        : [];
    const locations =
      criteria.locationMode === "cities" && selectedCities.length > 1
        ? selectedCities.map((city) => ({ ...criteria, city, cities: [city] }))
        : [criteria];
    const jobs = locations.flatMap((scope) =>
      plan.queries.map((query) => ({
        criteria: scope,
        query: {
          ...query,
          city: scope.city,
          cities: scope.cities,
          locationMode: scope.locationMode,
        },
      })),
    );
    const parts: SourceResult[] = [];
    for (const job of jobs) {
      // Sequential reservations preserve the existing daily/trial budget guard.
      // Query labels are already translated; do not re-plan them as local IDs.
      parts.push(
        await fetchSingleTarget(
          source,
          job.criteria,
          job.query,
          catalog,
          plan.mapping,
          config,
          reserve,
        ),
      );
    }
    const targets = parts.map((part, index) => ({
      brand: jobs[index].query.brand,
      model: jobs[index].query.model,
      city: jobs[index].criteria.city,
      state: jobs[index].criteria.state,
      status: part.status,
      message: part.message,
      partial: part.partial,
      received: part.received ?? part.listings.length,
      total: part.total,
      creditsReserved: part.creditsReserved,
      locationCredits: part.locationCredits ?? 0,
    }));
    if (parts.length === 1)
      return {
        ...parts[0],
        targets,
        elapsedMs: Math.round(performance.now() - start),
      };
    const successful = parts.filter((part) => part.status === "ok");
    const receivedListings = successful.flatMap((part) => part.listings);
    const listings = [
      ...new Map(
        receivedListings.map((row) => [`${row.source}:${row.externalId}`, row]),
      ).values(),
    ].map((row) => ({ ...row, reasons: eligibility(row, criteria) }));
    const duplicates = receivedListings.length - listings.length;
    const partial = parts.some((part) => part.partial || part.status !== "ok");
    const errors = [
      ...new Set(
        parts
          .filter((part) => part.status !== "ok")
          .map((part) => part.message),
      ),
    ];
    const coverage = partial
      ? "Cobertura parcial: há consultas não concluídas ou páginas ainda não recebidas."
      : "As primeiras páginas recebidas encerraram todos os recortes consultados.";
    return {
      ...result,
      status: successful.length ? "ok" : (parts[0]?.status ?? "error"),
      message: `${successful.length} de ${parts.length} consultas concluídas (${plan.queries.length} modelo(s) da fonte em ${locations.length} recorte(s) de localização). ${coverage}${errors.length ? ` ${errors.join(" ")}` : ""}`,
      elapsedMs: Math.round(performance.now() - start),
      creditsReserved: parts.reduce(
        (sum, part) => sum + part.creditsReserved,
        0,
      ),
      locationCredits: parts.reduce(
        (sum, part) => sum + (part.locationCredits ?? 0),
        0,
      ),
      // Native model/city scopes may overlap; adding totals would overstate inventory.
      total: null,
      partial,
      received: parts.reduce(
        (sum, part) => sum + (part.received ?? part.listings.length),
        0,
      ),
      normalizationDiscards: parts.reduce<Record<string, number>>(
        (counts, part) => {
          for (const [reason, count] of Object.entries(
            part.normalizationDiscards ?? {},
          ))
            counts[reason] = (counts[reason] ?? 0) + count;
          return counts;
        },
        duplicates ? { "Anúncio repetido entre consultas": duplicates } : {},
      ),
      applied: successful[0]?.applied ?? parts[0]?.applied,
      targets,
      listings,
    };
  } catch (error) {
    result.status = "error";
    result.message = collectionError(error);
  }
  result.elapsedMs = Math.round(performance.now() - start);
  return result;
}

async function fetchSingleTarget(
  source: Source,
  criteria: SearchCriteria,
  query: SearchCriteria,
  catalog: VehicleCatalog,
  mapping: SourceQueryMapping,
  config: ReturnType<typeof providerConfig>,
  reserve: (provider: string, credits: number) => Promise<void>,
): Promise<SourceResult> {
  const start = performance.now();
  const result = emptySourceResult(source);
  const observedAt = result.observedAt;
  try {
    const optionalFilters = [
      ...(criteria.yearMin !== null || criteria.yearMax !== null
        ? ["ano"]
        : []),
      ...(criteria.priceMax !== null ? ["preço máximo"] : []),
      ...(criteria.mileageMax !== null ? ["quilometragem máxima"] : []),
      ...(criteria.privateOnly ? ["vendedor particular"] : []),
    ];
    result.applied = {
      mapping,
      remote:
        source === "olx"
          ? [
              "marca/modelo (texto)",
              "estado/região",
              ...(criteria.priceMax !== null ? ["preço máximo"] : []),
            ]
          : ["marca", "modelo", "localização", ...optionalFilters],
      local: ["marca", "modelo", "localização", ...optionalFilters],
    };
    const { db } = await import("./db");
    if (source === "olx") await checkGecko(config.key);
    let olxUrl = "";
    let resolvedRegion: string | null = null;
    let needsVerification = false;
    if (source === "olx" && !olxUrl && criteria.locationMode === "cities") {
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
      olxUrl = buildOlxUrl(query, resolvedRegion);
    }
    if (source === "olx" && !olxUrl) olxUrl = buildOlxStateUrl(query);
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
              make: query.brand,
              model: query.model,
              location:
                criteria.locationMode === "state"
                  ? criteria.state.toLowerCase()
                  : `${criteria.state.toLowerCase()}-${normalized(criteria.city).replaceAll(" ", "-")}`,
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
    const meta = obj(payload.meta);
    result.total = integer(
      source === "olx"
        ? data.totalResults
        : (data.total_results ?? meta.total_results),
    );
    result.listings =
      source === "olx"
        ? normalizeOlx(data, observedAt, catalog)
        : normalizeReef(data, observedAt, catalog);
    // An empty or neighbouring-city page is a valid result. Never discard a
    // whole page or claim a failed integration just because no listing matches.
    if (
      source === "olx" &&
      needsVerification &&
      resolvedRegion &&
      result.listings.some(
        (row) =>
          row.city &&
          normalized(row.city) === normalized(criteria.city) &&
          row.state === criteria.state,
      )
    ) {
      await db.olxLocation.upsert({
        where: { id: locationKey(criteria) },
        create: { id: locationKey(criteria), region: resolvedRegion },
        update: { region: resolvedRegion, verifiedAt: new Date() },
      });
    }
    const receivedRows = source === "olx" ? data.items : data.listings;
    result.received = Array.isArray(receivedRows) ? receivedRows.length : 0;
    const normalizedCount = result.listings.length;
    result.normalizationDiscards = {};
    const overflow = Math.max(0, result.received - 100);
    if (overflow)
      result.normalizationDiscards["Limite de registros da resposta excedido"] =
        overflow;
    const invalid = result.received - overflow - normalizedCount;
    if (invalid)
      result.normalizationDiscards["Identificador ou URL de anúncio inválido"] =
        invalid;
    result.listings = [
      ...new Map(result.listings.map((row) => [row.externalId, row])).values(),
    ].map((row) => ({ ...row, reasons: eligibility(row, criteria) }));
    const duplicates = normalizedCount - result.listings.length;
    if (duplicates)
      result.normalizationDiscards["Anúncio duplicado na resposta"] =
        duplicates;
    result.partial =
      source === "olx"
        ? Boolean(data.nextPageUrl) ||
          result.total === null ||
          result.total > result.received ||
          overflow > 0
        : (data.has_more ?? obj(meta.pagination).has_more ?? meta.has_more) !==
            false ||
          overflow > 0 ||
          (result.total !== null && result.total > result.received);
    result.message = result.partial
      ? "Uma página consultada. Há cobertura parcial; consulte a origem para ver mais anúncios."
      : "Todos os resultados declarados para este recorte foram recebidos.";
  } catch (error) {
    result.status = "error";
    result.message = collectionError(error);
  }
  result.elapsedMs = Math.round(performance.now() - start);
  return result;
}
