import { normalized, type Listing } from "./discovery";
import { canonicalListingUrl } from "./listing-url";

export const COMPARISON_RULES = {
  minimum: 5,
  maxAgeDays: 7,
  yearTolerance: 1,
  mileageFloor: 20000,
  mileageRatio: 0.25,
  maxDispersion: 0.3,
};
export type Comparable = Pick<
  Listing,
  | "source"
  | "externalId"
  | "url"
  | "title"
  | "version"
  | "versionOrigin"
  | "modelYear"
  | "mileage"
  | "city"
  | "state"
  | "observedAt"
> & { priceCents: number };
export type ListingComparison = {
  status: "valid" | "insufficient";
  meanCents: number | null;
  differenceCents: number | null;
  belowPercent: number | null;
  count: number;
  evaluatedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  criteria: string[];
  limitations: string[];
  excludedOutliers: number;
  excludedPossibleDuplicates: number;
  comparables: Comparable[];
};
export const listingKey = (row: Pick<Listing, "source" | "externalId">) =>
  `${row.source}:${row.externalId}`;
const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && normalized(a) === normalized(b);
const recent = (row: Listing, now: number) => {
  const time = Date.parse(row.observedAt);
  return (
    Number.isFinite(time) &&
    time <= now &&
    now - time <= COMPARISON_RULES.maxAgeDays * 86400000
  );
};
export function validWholeVehiclePrice(row: Listing) {
  return (
    Number.isSafeInteger(row.priceCents) &&
    row.priceCents! >= 500000 &&
    row.priceCents! <= 2000000000 &&
    !/\b(sucata|sucateado|sinistrado|pecas|desmonte|parcela|parcelas)\b|\b(somente|apenas|valor da|preco da) entrada\b|^entrada\b/.test(
      normalized(row.title),
    )
  );
}
const identityComplete = (row: Listing) =>
  !!row.brand &&
  !!row.model &&
  !!row.version &&
  !!row.state &&
  row.modelYear !== null &&
  row.mileage !== null;
const catalogIdentityUncertain = (row: Listing) =>
  !!row.catalogResolution &&
  (row.catalogResolution.model !== "confirmed" ||
    row.catalogResolution.version !== "confirmed");
const fingerprint = (row: Listing) =>
  identityComplete(row) && row.city
    ? [
        row.brand,
        row.model,
        row.version,
        row.modelYear,
        row.mileage,
        row.city,
        row.state,
        row.priceCents,
      ]
        .map((x) => normalized(String(x)))
        .join("|")
    : null;
const quantile = (values: number[], p: number) => {
  const pos = (values.length - 1) * p,
    lo = Math.floor(pos),
    hi = Math.ceil(pos);
  return values[lo] + (values[hi] - values[lo]) * (pos - lo);
};
export function compareListing(
  target: Listing,
  universe: Listing[],
  now = Date.now(),
): ListingComparison {
  const result: ListingComparison = {
    status: "insufficient",
    meanCents: null,
    differenceCents: null,
    belowPercent: null,
    count: 0,
    evaluatedAt: new Date(now).toISOString(),
    periodStart: null,
    periodEnd: null,
    criteria: [
      "Mesma marca, modelo e versão identificada",
      "Ano-modelo: até 1 ano de diferença",
      "Km: diferença até 20 mil km ou 25% da quilometragem do candidato",
      "Cidade preferida; mesma UF se necessário",
      "Observações dos últimos 7 dias; mínimo de 5 comparáveis",
      "Média aritmética; sem teto de orçamento na referência",
    ],
    limitations: [],
    excludedOutliers: 0,
    excludedPossibleDuplicates: 0,
    comparables: [],
  };
  if (catalogIdentityUncertain(target)) {
    result.limitations.push(
      "Correspondência de modelo ou versão ainda não confirmada no catálogo; anúncios incertos não formam uma comparação exata.",
    );
    return result;
  }
  if (!identityComplete(target)) {
    result.limitations.push(
      "Faltam modelo, versão, ano, km ou UF para selecionar semelhantes com segurança.",
    );
    return result;
  }
  if (!validWholeVehiclePrice(target) || !recent(target, now)) {
    result.limitations.push(
      "Preço inválido, oferta incompatível com veículo completo ou observação fora dos últimos 7 dias.",
    );
    return result;
  }
  const unique = new Map<string, Listing>();
  const seenUrls = new Set<string>();
  const targetUrl = canonicalListingUrl(target.url);
  for (const row of [...universe].sort(
    (a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt),
  )) {
    const key = listingKey(row),
      url = canonicalListingUrl(row.url);
    if (unique.has(key) || seenUrls.has(url)) continue;
    seenUrls.add(url);
    unique.set(key, row);
  }
  // Cross-portal fingerprints are ambiguous. Exclude from the reference and disclose,
  // rather than silently merging records that may represent distinct cars.
  const portals = new Map<string, Set<string>>();
  for (const row of [...unique.values(), target]) {
    const fp = fingerprint(row);
    if (fp) {
      const sources = portals.get(fp) ?? new Set<string>();
      sources.add(row.source);
      portals.set(fp, sources);
    }
  }
  let peers = [...unique.values()].filter((row) => {
    if (
      listingKey(row) === listingKey(target) ||
      canonicalListingUrl(row.url) === targetUrl
    )
      return false;
    if (
      !validWholeVehiclePrice(row) ||
      !recent(row, now) ||
      catalogIdentityUncertain(row) ||
      !identityComplete(row)
    )
      return false;
    if (
      (["brandId", "modelId", "versionId"] as const).some(
        (field) =>
          row.identity?.[field] &&
          target.identity?.[field] &&
          row.identity[field] !== target.identity[field],
      ) ||
      !same(row.brand, target.brand) ||
      !same(row.model, target.model) ||
      !same(row.version, target.version) ||
      row.state !== target.state
    )
      return false;
    if (
      Math.abs(row.modelYear! - target.modelYear!) >
        COMPARISON_RULES.yearTolerance ||
      Math.abs(row.mileage! - target.mileage!) >
        Math.max(
          COMPARISON_RULES.mileageFloor,
          target.mileage! * COMPARISON_RULES.mileageRatio,
        )
    )
      return false;
    for (const field of ["fuel", "transmission", "engine"] as const)
      if (row[field] && target[field] && !same(row[field], target[field]))
        return false;
    const fp = fingerprint(row);
    if (fp && (portals.get(fp)?.size ?? 0) > 1) {
      result.excludedPossibleDuplicates++;
      return false;
    }
    return true;
  });
  const local = peers.filter((row) => same(row.city, target.city));
  if (local.length >= COMPARISON_RULES.minimum) peers = local;
  else if (peers.some((row) => !same(row.city, target.city)))
    result.limitations.push(
      "Região ampliada para a mesma UF; nem todos os anúncios são da cidade do candidato.",
    );
  if (peers.length >= COMPARISON_RULES.minimum) {
    const prices = peers.map((x) => x.priceCents!).sort((a, b) => a - b);
    const q1 = quantile(prices, 0.25),
      q3 = quantile(prices, 0.75),
      iqr = q3 - q1;
    const filtered = peers.filter(
      (x) => x.priceCents! >= q1 - 1.5 * iqr && x.priceCents! <= q3 + 1.5 * iqr,
    );
    result.excludedOutliers = peers.length - filtered.length;
    peers = filtered;
  }
  result.comparables = peers.map(
    ({
      source,
      externalId,
      url,
      title,
      version,
      versionOrigin,
      modelYear,
      mileage,
      city,
      state,
      observedAt,
      priceCents,
    }) => ({
      source,
      externalId,
      url,
      title,
      version,
      versionOrigin,
      modelYear,
      mileage,
      city,
      state,
      observedAt,
      priceCents: priceCents!,
    }),
  );
  result.count = peers.length;
  const times = peers.map((x) => x.observedAt).sort();
  result.periodStart = times[0] ?? null;
  result.periodEnd = times.at(-1) ?? null;
  if (
    target.versionOrigin === "inferred" ||
    peers.some((x) => x.versionOrigin === "inferred")
  )
    result.limitations.push(
      "Versão inferida do campo de modelo da fonte; não confirmada por catálogo de versões.",
    );
  if (peers.some((x) => x.modelYear !== target.modelYear))
    result.limitations.push("Amostra inclui anos-modelo vizinhos (até 1 ano).");
  if ([target, ...peers].some((x) => !x.fuel || !x.engine || !x.transmission))
    result.limitations.push(
      "Motorização, combustível ou câmbio ausentes em parte da amostra; compatibilidade verificada apenas nos campos disponíveis.",
    );
  if (result.excludedPossibleDuplicates)
    result.limitations.push(
      `${result.excludedPossibleDuplicates} possível(is) duplicata(s) entre portais excluída(s) da referência, sem mesclar registros.`,
    );
  if (result.excludedOutliers)
    result.limitations.push(
      `${result.excludedOutliers} preço(s) extremo(s) fora de 1,5 × IQR excluído(s).`,
    );
  if (peers.length < COMPARISON_RULES.minimum) {
    result.limitations.push(
      "Ainda não há comparação confiável: são necessários 5 comparáveis válidos.",
    );
    return result;
  }
  const prices = peers.map((x) => x.priceCents!).sort((a, b) => a - b),
    median = quantile(prices, 0.5);
  if (
    (quantile(prices, 0.75) - quantile(prices, 0.25)) / median >
      COMPARISON_RULES.maxDispersion ||
    target.priceCents! < median * 0.5
  ) {
    result.limitations.push(
      "Preços muito dispersos ou candidato abaixo de metade da mediana: confira a oferta antes de comparar.",
    );
    return result;
  }
  result.meanCents = prices.reduce((a, b) => a + b, 0) / prices.length;
  result.differenceCents = result.meanCents - target.priceCents!;
  result.belowPercent = (result.differenceCents / result.meanCents) * 100;
  result.status = "valid";
  return result;
}
export function sortListings(
  rows: Listing[],
  sort: "discount" | "price" | "recent",
) {
  return [...rows].sort((a, b) =>
    sort === "price"
      ? (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity)
      : sort === "recent"
        ? Date.parse(b.observedAt) - Date.parse(a.observedAt)
        : (b.comparison?.status === "valid"
            ? b.comparison.belowPercent!
            : -Infinity) -
            (a.comparison?.status === "valid"
              ? a.comparison.belowPercent!
              : -Infinity) ||
          (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity),
  );
}
