import {
  filterVehicles,
  type Filters,
  type PriceObservation,
  type Vehicle,
} from "./vehicle";

export type OpportunityRules = {
  minComparables: number;
  strongMinComparables: number;
  staleDays: number;
  reductionDays: number;
  potentialDiscount: number;
  strongDiscount: number;
  maximumDiscount: number;
  maximumDispersion: number;
  strongReductionPercent: number;
  aboveThreshold: number;
};
/** Rules are explicit thresholds, not an opaque score or a guarantee of resale. */
export const OPPORTUNITY_RULES: Readonly<OpportunityRules> = Object.freeze({
  minComparables: 5,
  strongMinComparables: 8,
  staleDays: 45,
  reductionDays: 30,
  potentialDiscount: 5,
  strongDiscount: 10,
  maximumDiscount: 30,
  maximumDispersion: 0.3,
  strongReductionPercent: 2,
  aboveThreshold: -5,
});

export type Classification =
  "strong" | "potential" | "aligned" | "above" | "insufficient";
export type PriceReduction = {
  amountCents: number;
  percent: number;
  previousPriceCents: number;
  currentPriceCents: number;
  observedAt: string;
};
export type VehicleAnalysis = {
  classification: Classification;
  label: string;
  confidence: "high" | "moderate" | "insufficient";
  comparableIds: string[];
  comparablesCount: number;
  comparableMedianCents: number | null;
  discountPercent: number | null;
  priceRangeCents: { min: number; max: number } | null;
  percentile: number | null;
  dispersion: number | null;
  reduction: PriceReduction | null;
  reasons: string[];
  limitations: string[];
};
export type IntelligenceOptions = {
  now?: number;
  universe?: Vehicle[];
  histories?: Record<string, PriceObservation[]>;
  config?: Partial<OpportunityRules>;
  includeComparableIds?: boolean;
  periodDays?: number;
};
export type PriceBin = { minCents: number; maxCents: number; count: number };
export type MarketGroup = {
  key: string;
  brand: string;
  model: string;
  count: number;
  medianPriceCents: number;
  opportunitiesCount: number;
  medianReferenceDiscount: number | null;
  dispersion: number;
};
export type MarketSummary = {
  count: number;
  medianPriceCents: number | null;
  referenceCount: number;
  medianReferenceDiscount: number | null;
  opportunitiesCount: number;
  strongCount: number;
  newCount: number;
  belowReferenceCount: number;
  favoriteCount: number;
  latestPriceRecord: string | null;
  earliestRegistration: string | null;
  periodDays: number;
  reducedCount: number;
  distribution: PriceBin[];
  groups: MarketGroup[];
};

const DAY = 86_400_000;
const LABELS: Record<Classification, string> = {
  strong: "Oportunidade forte",
  potential: "Potencial oportunidade",
  aligned: "Preço alinhado aos comparáveis",
  above: "Acima dos comparáveis",
  insufficient: "Dados insuficientes",
};
const ORDER: Record<Classification, number> = {
  strong: 0,
  potential: 1,
  aligned: 2,
  above: 3,
  insufficient: 4,
};
const percentage = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const positiveCents = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const clockOf = (options: IntelligenceOptions) => options.now ?? Date.now();
const roundPercent = (value: number | null) =>
  value === null ? null : Math.round((value + Number.EPSILON) * 100) / 100;

export function quantile(values: number[], probability: number): number | null {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * Math.max(0, Math.min(1, probability));
  const lower = Math.floor(position);
  return (
    sorted[lower] +
    (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower)
  );
}

export function median(values: number[]): number | null {
  return quantile(values, 0.5);
}

export function medianCents(values: number[]): number | null {
  const value = median(values.filter(positiveCents));
  return value === null ? null : Math.round(value);
}

/** Manual reference. Positive means asking price is below the user-entered value. */
export function referenceDiscount(vehicle: Vehicle): number | null {
  return positiveCents(vehicle.referenceCents) &&
    positiveCents(vehicle.priceCents)
    ? ((vehicle.referenceCents - vehicle.priceCents) / vehicle.referenceCents) *
        100
    : null;
}

function historyFor(vehicle: Vehicle, options: IntelligenceOptions) {
  return options.histories?.[vehicle.id] ?? vehicle.priceHistory ?? [];
}

/** Never use updatedAt: favorites and non-financial edits also change it. */
export function priceRecordDate(
  vehicle: Vehicle,
  options: IntelligenceOptions = {},
): string {
  const latest = historyFor(vehicle, options)
    .filter(
      (item) =>
        positiveCents(item.priceCents) &&
        Number.isFinite(Date.parse(item.observedAt)) &&
        Date.parse(item.observedAt) <= clockOf(options),
    )
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
  return latest?.observedAt ?? vehicle.priceRecordedAt ?? vehicle.createdAt;
}

export function recentReduction(
  vehicle: Vehicle,
  options: IntelligenceOptions = {},
): PriceReduction | null {
  const now = clockOf(options);
  const days = options.config?.reductionDays ?? OPPORTUNITY_RULES.reductionDays;
  const history = historyFor(vehicle, options)
    .filter(
      (item) =>
        positiveCents(item.priceCents) &&
        Number.isFinite(Date.parse(item.observedAt)) &&
        Date.parse(item.observedAt) <= now,
    )
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (history.length < 2) return null;
  const latest = history[history.length - 1];
  if (
    latest.priceCents !== vehicle.priceCents ||
    now - Date.parse(latest.observedAt) > days * DAY
  )
    return null;
  let previousIndex = history.length - 2;
  while (
    previousIndex >= 0 &&
    history[previousIndex].priceCents === latest.priceCents
  )
    previousIndex--;
  if (previousIndex < 0) return null;
  const previous = history[previousIndex];
  const changedAt = history[previousIndex + 1].observedAt;
  if (
    previous.priceCents <= latest.priceCents ||
    now - Date.parse(changedAt) > days * DAY
  )
    return null;
  return {
    amountCents: previous.priceCents - latest.priceCents,
    percent:
      roundPercent(
        ((previous.priceCents - latest.priceCents) / previous.priceCents) * 100,
      ) ?? 0,
    previousPriceCents: previous.priceCents,
    currentPriceCents: latest.priceCents,
    observedAt: changedAt,
  };
}

/** Deduplicate only reliable URLs, never vehicle similarity or price. */
function listingIdentity(vehicle: Vehicle) {
  if (vehicle.originalUrl) {
    try {
      const url = new URL(vehicle.originalUrl);
      if (!["http:", "https:"].includes(url.protocol))
        return `id:${vehicle.id}`;
      url.hash = "";
      for (const key of [...url.searchParams.keys()])
        if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid)$/i.test(key))
          url.searchParams.delete(key);
      url.searchParams.sort();
      url.pathname = url.pathname.replace(/\/$/, "") || "/";
      return `url:${url.href}`;
    } catch {
      // A malformed legacy URL cannot establish identity.
    }
  }
  return `id:${vehicle.id}`;
}

function hasIdentity(vehicle: Vehicle) {
  return (
    [
      vehicle.brand,
      vehicle.model,
      vehicle.version,
      vehicle.fuel,
      vehicle.state,
    ].every((value) => Boolean(normalize(value))) &&
    Number.isInteger(vehicle.modelYear)
  );
}

function cohortKey(vehicle: Vehicle) {
  return [
    vehicle.brand,
    vehicle.model,
    vehicle.version,
    vehicle.fuel,
    vehicle.state,
  ]
    .map(normalize)
    .concat(String(vehicle.modelYear))
    .join("\u001f");
}

function isFresh(vehicle: Vehicle, options: IntelligenceOptions) {
  const observed = Date.parse(priceRecordDate(vehicle, options));
  return (
    positiveCents(vehicle.priceCents) &&
    Number.isFinite(observed) &&
    observed <= clockOf(options) &&
    clockOf(options) - observed <
      (options.config?.staleDays ?? OPPORTUNITY_RULES.staleDays) * DAY
  );
}

type Cohort = {
  sorted: Vehicle[];
  indexByIdentity: Map<string, number>;
};

function prepareCohort(
  vehicles: Vehicle[],
  options: IntelligenceOptions,
): Cohort {
  const unique = new Map<string, Vehicle>();
  for (const vehicle of vehicles) {
    const identity = listingIdentity(vehicle);
    const previous = unique.get(identity);
    if (
      !previous ||
      Date.parse(priceRecordDate(vehicle, options)) >
        Date.parse(priceRecordDate(previous, options))
    )
      unique.set(identity, vehicle);
  }
  const sorted = [...unique.values()].sort(
    (a, b) => a.priceCents - b.priceCents || a.id.localeCompare(b.id),
  );
  return {
    sorted,
    indexByIdentity: new Map(
      sorted.map((vehicle, index) => [listingIdentity(vehicle), index]),
    ),
  };
}

/** Virtual leave-one-out sorted slices keep bulk computation O(n log n). */
function comparableStats(
  vehicle: Vehicle,
  cohort: Cohort,
  includeIds: boolean,
) {
  const excludedIndex =
    cohort.indexByIdentity.get(listingIdentity(vehicle)) ?? -1;
  const length = cohort.sorted.length - (excludedIndex >= 0 ? 1 : 0);
  const itemAt = (index: number) =>
    cohort.sorted[
      index + (excludedIndex >= 0 && index >= excludedIndex ? 1 : 0)
    ];
  const priceAt = (index: number) => itemAt(index).priceCents;
  const q = (start: number, count: number, probability: number) => {
    if (!count) return null;
    const position = (count - 1) * probability;
    const lower = Math.floor(position);
    return (
      priceAt(start + lower) +
      (priceAt(start + Math.ceil(position)) - priceAt(start + lower)) *
        (position - lower)
    );
  };
  const bound = (value: number, inclusive: boolean) => {
    let left = 0;
    let right = length;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (priceAt(middle) < value || (inclusive && priceAt(middle) === value))
        left = middle + 1;
      else right = middle;
    }
    return left;
  };
  let start = 0;
  let end = length;
  if (length >= 5) {
    const q1 = q(0, length, 0.25)!;
    const q3 = q(0, length, 0.75)!;
    const iqr = q3 - q1;
    start = bound(q1 - 1.5 * iqr, false);
    end = bound(q3 + 1.5 * iqr, true);
  }
  const count = end - start;
  const midpoint = q(start, count, 0.5);
  const less = Math.max(
    0,
    Math.min(end, bound(vehicle.priceCents, false)) - start,
  );
  const lessOrEqual = Math.max(
    0,
    Math.min(end, bound(vehicle.priceCents, true)) - start,
  );
  return {
    candidateCount: length,
    count,
    medianCents: midpoint === null ? null : Math.round(midpoint),
    ids: includeIds
      ? Array.from({ length: count }, (_, index) => itemAt(start + index).id)
      : [],
    range: count ? { min: priceAt(start), max: priceAt(end - 1) } : null,
    percentile: count
      ? ((less + (lessOrEqual - less) / 2) / count) * 100
      : null,
    dispersion:
      count && midpoint
        ? (q(start, count, 0.75)! - q(start, count, 0.25)!) / midpoint
        : null,
  };
}

function analyzeWithCohort(
  vehicle: Vehicle,
  options: IntelligenceOptions,
  cohort: Cohort,
): VehicleAnalysis {
  const config = { ...OPPORTUNITY_RULES, ...options.config };
  const reduction = recentReduction(vehicle, options);
  const result: VehicleAnalysis = {
    classification: "insufficient",
    label: LABELS.insufficient,
    confidence: "insufficient",
    comparableIds: [],
    comparablesCount: 0,
    comparableMedianCents: null,
    discountPercent: null,
    priceRangeCents: null,
    percentile: null,
    dispersion: null,
    reduction,
    reasons: [],
    limitations: [
      "A recência usa o registro do preço no catálogo; não confirma a disponibilidade do anúncio na fonte.",
    ],
  };
  if (!hasIdentity(vehicle)) {
    result.limitations.push(
      "Marca, modelo, versão, ano-modelo, combustível e UF precisam estar identificados para formar comparáveis.",
    );
    return result;
  }
  if (!isFresh(vehicle, options)) {
    result.limitations.push(
      `O preço precisa ser válido e ter registro há menos de ${config.staleDays} dias. Favoritar ou editar outros campos não renova o preço.`,
    );
    return result;
  }
  const stats = comparableStats(
    vehicle,
    cohort,
    options.includeComparableIds !== false,
  );
  result.comparableIds = stats.ids;
  result.comparablesCount = stats.count;
  result.comparableMedianCents = stats.medianCents;
  result.priceRangeCents = stats.range;
  result.percentile = roundPercent(stats.percentile);
  result.dispersion = stats.dispersion;
  const rawDiscountPercent =
    stats.medianCents === null
      ? null
      : ((stats.medianCents - vehicle.priceCents) / stats.medianCents) * 100;
  result.discountPercent = roundPercent(rawDiscountPercent);
  if (stats.candidateCount !== stats.count)
    result.limitations.push(
      `${stats.candidateCount - stats.count} preço(s) extremo(s) excluído(s) pela regra de 1,5 intervalo interquartil.`,
    );
  if (stats.count < config.minComparables) {
    result.limitations.push(
      `São necessários ao menos ${config.minComparables} comparáveis atuais; há ${stats.count} na amostra.`,
    );
    return result;
  }
  if (result.dispersion! > config.maximumDispersion) {
    result.limitations.push(
      "A dispersão dos comparáveis é elevada; a amostra não sustenta uma classificação.",
    );
    return result;
  }
  if (rawDiscountPercent! > config.maximumDiscount) {
    result.limitations.push(
      `Preço mais de ${config.maximumDiscount}% abaixo dos comparáveis: confira a identificação, o preço e as condições do anúncio.`,
    );
    return result;
  }
  result.confidence =
    stats.count >= config.strongMinComparables ? "high" : "moderate";
  if (
    rawDiscountPercent! >= config.strongDiscount &&
    stats.count >= config.strongMinComparables &&
    reduction !== null &&
    (reduction.amountCents / reduction.previousPriceCents) * 100 >=
      config.strongReductionPercent
  )
    result.classification = "strong";
  else if (rawDiscountPercent! >= config.potentialDiscount)
    result.classification = "potential";
  else if (rawDiscountPercent! < config.aboveThreshold)
    result.classification = "above";
  else result.classification = "aligned";
  result.label = LABELS[result.classification];
  result.reasons.push(
    `Preço ${percentage.format(Math.abs(result.discountPercent!))}% ${result.discountPercent! >= 0 ? "abaixo" : "acima"} da mediana de ${stats.count} anúncios da mesma marca, modelo, versão, ano-modelo, combustível e UF.`,
  );
  if (reduction)
    result.reasons.push(
      `Redução registrada de ${currency.format(reduction.amountCents / 100)} (${percentage.format(reduction.percent)}%) nos últimos ${config.reductionDays} dias.`,
    );
  result.limitations.push(
    "A amostra contém preços cadastrados. Conservação, histórico do veículo, quilometragem relativa e negociação não compõem a classificação.",
    "O valor de referência manual não é FIPE e não define a classificação. Suficiência da amostra não significa segurança da compra.",
  );
  return result;
}

export function analyzeVehicle(
  vehicle: Vehicle,
  universe: Vehicle[],
  options: IntelligenceOptions = {},
): VehicleAnalysis {
  const normalizedOptions = { ...options, now: clockOf(options) };
  const candidates = universe.filter(
    (other) =>
      hasIdentity(other) &&
      cohortKey(other) === cohortKey(vehicle) &&
      isFresh(other, normalizedOptions),
  );
  return analyzeWithCohort(
    vehicle,
    normalizedOptions,
    prepareCohort(candidates, normalizedOptions),
  );
}

/** Bulk results omit ID arrays unless requested, avoiding quadratic memory use. */
export function analyzeVehicles(
  vehicles: Vehicle[],
  options: IntelligenceOptions = {},
): Map<string, VehicleAnalysis> {
  const normalizedOptions = {
    ...options,
    now: clockOf(options),
    includeComparableIds: options.includeComparableIds ?? false,
  };
  const groups = new Map<string, Vehicle[]>();
  for (const vehicle of options.universe ?? vehicles) {
    if (!hasIdentity(vehicle) || !isFresh(vehicle, normalizedOptions)) continue;
    const group = cohortKey(vehicle);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(vehicle);
  }
  const cohorts = new Map(
    [...groups].map(([key, values]) => [
      key,
      prepareCohort(values, normalizedOptions),
    ]),
  );
  const empty: Cohort = { sorted: [], indexByIdentity: new Map() };
  return new Map(
    vehicles.map((vehicle) => [
      vehicle.id,
      analyzeWithCohort(
        vehicle,
        normalizedOptions,
        cohorts.get(cohortKey(vehicle)) ?? empty,
      ),
    ]),
  );
}

/** Filters affect the shown sample, never the underlying comparable universe. */
export function filterIntelligentVehicles(
  vehicles: Vehicle[],
  filters: Filters,
  options: IntelligenceOptions = {},
): Vehicle[] {
  const normalizedOptions = { ...options, now: clockOf(options) };
  let rows = filterVehicles(vehicles, filters, normalizedOptions.now);
  const analyses =
    filters.classification || filters.sort === "opportunity"
      ? analyzeVehicles(rows, {
          ...normalizedOptions,
          universe: options.universe ?? vehicles,
        })
      : null;
  if (filters.reduced)
    rows = rows.filter((vehicle) =>
      recentReduction(vehicle, normalizedOptions),
    );
  if (filters.classification)
    rows = rows.filter((vehicle) => {
      const classification = analyses!.get(vehicle.id)!.classification;
      return filters.classification === "opportunities"
        ? classification === "strong" || classification === "potential"
        : classification === filters.classification;
    });
  if (filters.sort === "opportunity")
    rows.sort((a, b) => {
      const aAnalysis = analyses!.get(a.id)!;
      const bAnalysis = analyses!.get(b.id)!;
      return (
        ORDER[aAnalysis.classification] - ORDER[bAnalysis.classification] ||
        (bAnalysis.discountPercent ?? -Infinity) -
          (aAnalysis.discountPercent ?? -Infinity) ||
        a.id.localeCompare(b.id)
      );
    });
  if (filters.sort === "reduction") {
    const reductions = new Map(
      rows.map((vehicle) => [
        vehicle.id,
        recentReduction(vehicle, normalizedOptions)?.amountCents ?? 0,
      ]),
    );
    rows.sort(
      (a, b) =>
        reductions.get(b.id)! - reductions.get(a.id)! ||
        a.id.localeCompare(b.id),
    );
  }
  return rows;
}

export function histogramCents(values: number[], binCount = 6): PriceBin[] {
  const valid = values.filter(positiveCents);
  if (!valid.length) return [];
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min === max)
    return [{ minCents: min, maxCents: max, count: valid.length }];
  const requestedCount = Number.isFinite(binCount) ? Math.floor(binCount) : 6;
  const count = Math.max(1, Math.min(20, requestedCount, max - min + 1));
  const step = (max - min + 1) / count;
  const bins = Array.from({ length: count }, (_, index) => ({
    minCents: Math.ceil(min + index * step),
    maxCents: Math.min(max, Math.ceil(min + (index + 1) * step) - 1),
    count: 0,
  }));
  for (const value of valid)
    bins[Math.min(count - 1, Math.floor((value - min) / step))].count++;
  return bins;
}

export function marketSummary(
  vehicles: Vehicle[],
  options: IntelligenceOptions = {},
): MarketSummary {
  const normalizedOptions = { ...options, now: clockOf(options) };
  const periodDays =
    finite(options.periodDays) && options.periodDays > 0
      ? options.periodDays
      : 30;
  const rows = vehicles.filter((vehicle) => positiveCents(vehicle.priceCents));
  const analyses = analyzeVehicles(rows, {
    ...normalizedOptions,
    universe: options.universe ?? vehicles,
  });
  const discounts = rows.map(referenceDiscount).filter(finite);
  const priceDates = rows
    .map((vehicle) => Date.parse(priceRecordDate(vehicle, normalizedOptions)))
    .filter(
      (value) => Number.isFinite(value) && value <= normalizedOptions.now,
    );
  const registrationDates = rows
    .map((vehicle) => Date.parse(vehicle.createdAt))
    .filter(
      (value) => Number.isFinite(value) && value <= normalizedOptions.now,
    );
  const groups = new Map<string, Vehicle[]>();
  for (const vehicle of rows) {
    const key = [vehicle.brand, vehicle.model].map(normalize).join("\u001f");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(vehicle);
  }
  return {
    count: rows.length,
    medianPriceCents: medianCents(rows.map((vehicle) => vehicle.priceCents)),
    referenceCount: discounts.length,
    medianReferenceDiscount: roundPercent(median(discounts)),
    opportunitiesCount: [...analyses.values()].filter((analysis) =>
      ["strong", "potential"].includes(analysis.classification),
    ).length,
    strongCount: [...analyses.values()].filter(
      (analysis) => analysis.classification === "strong",
    ).length,
    newCount: rows.filter((vehicle) => {
      const created = Date.parse(vehicle.createdAt);
      return (
        Number.isFinite(created) &&
        created <= normalizedOptions.now &&
        normalizedOptions.now - created <= periodDays * DAY
      );
    }).length,
    belowReferenceCount: discounts.filter((discount) => discount > 0).length,
    favoriteCount: rows.filter((vehicle) => vehicle.favorite).length,
    latestPriceRecord: priceDates.length
      ? new Date(Math.max(...priceDates)).toISOString()
      : null,
    earliestRegistration: registrationDates.length
      ? new Date(Math.min(...registrationDates)).toISOString()
      : null,
    periodDays,
    reducedCount: rows.filter((vehicle) =>
      recentReduction(vehicle, normalizedOptions),
    ).length,
    distribution: histogramCents(rows.map((vehicle) => vehicle.priceCents)),
    groups: [...groups]
      .map(([key, values]): MarketGroup => {
        const prices = values.map((vehicle) => vehicle.priceCents);
        const midpoint = medianCents(prices)!;
        return {
          key,
          brand: values[0].brand,
          model: values[0].model,
          count: values.length,
          medianPriceCents: midpoint,
          opportunitiesCount: values.filter((vehicle) =>
            ["strong", "potential"].includes(
              analyses.get(vehicle.id)!.classification,
            ),
          ).length,
          medianReferenceDiscount: roundPercent(
            median(values.map(referenceDiscount).filter(finite)),
          ),
          dispersion:
            (quantile(prices, 0.75)! - quantile(prices, 0.25)!) / midpoint,
        };
      })
      .sort(
        (a, b) =>
          b.opportunitiesCount - a.opportunitiesCount ||
          b.count - a.count ||
          a.model.localeCompare(b.model, "pt-BR"),
      ),
  };
}

export type PurchaseInput = {
  purchasePriceCents: number;
  salePriceCents: number;
  preparationCents?: number;
  transportCents?: number;
  documentationCents?: number;
  taxesCents?: number;
  otherCostsCents?: number;
  targetMargin?: number;
};
export type PurchaseSimulation = {
  valid: boolean;
  errors: string[];
  capitalCents: number | null;
  costsCents: number | null;
  resultCents: number | null;
  margin: number | null;
  maxPurchasePriceCents: number | null;
  sensitivity: {
    change: number;
    salePriceCents: number;
    resultCents: number;
    margin: number | null;
  }[];
};

export function simulatePurchase(input: PurchaseInput): PurchaseSimulation {
  const values = {
    preparationCents: 0,
    transportCents: 0,
    documentationCents: 0,
    taxesCents: 0,
    otherCostsCents: 0,
    targetMargin: 0,
    ...input,
  };
  const errors = Object.entries(values)
    .filter(
      ([key, value]) =>
        !finite(value) ||
        value < 0 ||
        (key !== "targetMargin" && !Number.isSafeInteger(value)),
    )
    .map(([key]) => key);
  if (!finite(input.purchasePriceCents)) errors.push("purchasePriceCents");
  if (
    !finite(input.salePriceCents) ||
    !Number.isSafeInteger(Math.round(input.salePriceCents * 1.1))
  )
    errors.push("salePriceCents");
  if (values.targetMargin >= 100) errors.push("targetMargin");
  const costsCents =
    values.preparationCents +
    values.transportCents +
    values.documentationCents +
    values.taxesCents +
    values.otherCostsCents;
  const capitalCents = values.purchasePriceCents + costsCents;
  if (!Number.isSafeInteger(capitalCents)) errors.push("capitalCents");
  if (errors.length)
    return {
      valid: false,
      errors: [...new Set(errors)],
      capitalCents: null,
      costsCents: null,
      resultCents: null,
      margin: null,
      maxPurchasePriceCents: null,
      sensitivity: [],
    };
  const resultCents = values.salePriceCents - capitalCents;
  return {
    valid: true,
    errors: [],
    capitalCents,
    costsCents,
    resultCents,
    margin:
      values.salePriceCents > 0
        ? roundPercent((resultCents / values.salePriceCents) * 100)
        : null,
    // Floor ensures the calculated maximum never breaches the target margin.
    maxPurchasePriceCents: Math.floor(
      values.salePriceCents * (1 - values.targetMargin / 100) - costsCents,
    ),
    sensitivity: [-10, -5, 0, 5, 10].map((change) => {
      const salePriceCents = Math.round(
        values.salePriceCents * (1 + change / 100),
      );
      return {
        change,
        salePriceCents,
        resultCents: salePriceCents - capitalCents,
        margin:
          salePriceCents > 0
            ? roundPercent(
                ((salePriceCents - capitalCents) / salePriceCents) * 100,
              )
            : null,
      };
    }),
  };
}
