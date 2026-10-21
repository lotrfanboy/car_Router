import { existsSync, readFileSync } from "node:fs";
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
    gecko || secret("REEF_FREE_TRIAL", ".env.reef.local") === "true";
  return {
    key,
    configured: Boolean(key) && enabled,
    cost: gecko ? 1 : 2,
    provider: gecko ? "gecko" : "reef",
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
    const fullModel = attrs.vehicle_model ?? "";
    const words = fullModel.split(/\s+/);
    // OLX mixes model and trim. Preserve uncertainty for multiword models; protect common Corolla derivatives.
    const model = /^corolla (cross|fielder)\b/i.test(fullModel)
      ? words.slice(0, 2).join(" ")
      : words[0] || null;
    return [
      {
        source: "olx",
        externalId: id,
        url,
        title: str(r.title) ?? "Anúncio OLX",
        brand: str(attrs.vehicle_brand),
        model,
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
      message:
        source === "olx"
          ? "Conecte sua conta gratuita Gecko para consultar a OLX."
          : "Conecte uma conta gratuita Reef para consultar a Webmotors.",
    };
  try {
    if (source === "olx") await checkGecko(config.key);
    await reserve(config.provider, config.cost);
    result.creditsReserved = config.cost;
    const payload =
      source === "olx"
        ? await providerJson(
            "https://api.geckoapi.com.br/v1/extract",
            config.key,
            { target: "olx.com.br", type: "plp", url: criteria.olxUrl },
          )
        : await providerJson(
            "https://api.reefapi.com/webmotors/v1/search",
            config.key,
            {
              make: criteria.brand,
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
      /^(Fornecedor|Créditos|Limite|Consulta|Custo|A OLX|A Webmotors|Webmotors|Orçamento|Aguarde)/.test(
        error.message,
      )
        ? error.message
        : "Falha na consulta. Tente novamente mais tarde; não houve repetição automática.";
  }
  result.elapsedMs = Math.round(performance.now() - start);
  return result;
}
