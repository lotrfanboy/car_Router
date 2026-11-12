import {
  listingMatchStatus,
  normalized,
  type Listing,
  type SearchCriteria,
  type SourceResult,
} from "./discovery";
import { listingKey } from "./listing-comparison";

export type RadarView = {
  id: string;
  searchId: string;
  name: string;
  enabled: boolean;
  channel: string;
  state: "paused" | "pending" | "scheduled" | "running" | "success" | "error";
  lastRunAt: string | null;
  nextRunAt: string | null;
  criteria: SearchCriteria;
  notices: RadarNoticeView[];
  emailDeliveries: { id: string; status: string; deliveredAt: string | null }[];
};
export type RadarNoticeView = {
  id: string;
  kind: string;
  listing: Listing | null;
  matchStatus: string;
  priceCents: number;
  previousPriceCents: number | null;
  createdAt: string;
};
export type RadarOffer = {
  listing: Listing;
  matchStatus: "confirmed" | "uncertain";
  historical: boolean;
  event: {
    kind: "new_listing" | "price_drop";
    at: string;
    previousPriceCents: number | null;
  } | null;
};
export type RadarDetail = {
  radar: RadarView;
  offers: RadarOffer[];
  sources: {
    source: string;
    status: string;
    partial: boolean;
    observedAt: string;
    historical: boolean;
  }[];
  lastConsultedAt: string | null;
  emailEnabled: boolean;
};
export const radarStateLabels: Record<RadarView["state"], string> = {
  paused: "Pausado",
  pending: "Monitoramento pendente",
  scheduled: "Aguardando primeira consulta",
  running: "Consultando",
  success: "Monitorando",
  error: "Última consulta falhou",
};
export function radarYears(criteria: SearchCriteria) {
  if (criteria.yearMin && criteria.yearMax)
    return `${criteria.yearMin}–${criteria.yearMax}`;
  if (criteria.yearMin) return `${criteria.yearMin} em diante`;
  if (criteria.yearMax) return `Até ${criteria.yearMax}`;
  return "Todos os anos";
}
export function recordedOffers(radar: RadarView) {
  return new Set(
    radar.notices
      .filter((n) => n.matchStatus === "confirmed" && n.listing)
      .map((n) => listingKey(n.listing!)),
  ).size;
}
/** A badge needs a durable event for this listing and this observed price. */
export function evidencedRadarEvent(
  listing: Listing,
  notices: RadarNoticeView[],
): RadarOffer["event"] {
  const notice = notices
    .filter(
      (n) =>
        n.listing &&
        listingKey(n.listing) === listingKey(listing) &&
        n.matchStatus === "confirmed" &&
        n.priceCents === listing.priceCents &&
        Number.isFinite(Date.parse(n.createdAt)),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .find(
      (n) =>
        n.kind === "new_listing" ||
        (n.kind === "price_drop" &&
          n.previousPriceCents !== null &&
          n.previousPriceCents > n.priceCents &&
          n.priceCents > 0),
    );
  return notice
    ? {
        kind: notice.kind as "new_listing" | "price_drop",
        at: notice.createdAt,
        previousPriceCents: notice.previousPriceCents,
      }
    : null;
}
export type RadarOfferFilters = {
  query: string;
  source: string;
  city: string;
  match: "confirmed" | "uncertain";
  event: string;
  yearMin: string;
  yearMax: string;
  priceMax: string;
  mileageMax: string;
  sort: string;
};
export const emptyRadarFilters: RadarOfferFilters = {
  query: "",
  source: "",
  city: "",
  match: "confirmed",
  event: "",
  yearMin: "",
  yearMax: "",
  priceMax: "",
  mileageMax: "",
  sort: "recent",
};
export function filterRadarOffers(
  offers: RadarOffer[],
  filters: RadarOfferFilters,
) {
  const numberFilter = (
    value: number | null,
    limit: string,
    direction: "min" | "max",
    multiplier = 1,
  ) =>
    !limit ||
    (value !== null &&
      (direction === "min"
        ? value >= Number(limit) * multiplier
        : value <= Number(limit) * multiplier));
  return offers
    .filter(
      ({ listing: l, matchStatus, event }) =>
        matchStatus === filters.match &&
        (!filters.query ||
          normalized(`${l.title} ${l.version ?? ""}`).includes(
            normalized(filters.query),
          )) &&
        (!filters.source || l.source === filters.source) &&
        (!filters.city || l.city === filters.city) &&
        (!filters.event || event?.kind === filters.event) &&
        numberFilter(l.modelYear, filters.yearMin, "min") &&
        numberFilter(l.modelYear, filters.yearMax, "max") &&
        numberFilter(l.priceCents, filters.priceMax, "max", 100) &&
        numberFilter(l.mileage, filters.mileageMax, "max"),
    )
    .sort((a, b) => {
      const x = a.listing,
        y = b.listing;
      if (filters.sort === "priceAsc")
        return (x.priceCents ?? Infinity) - (y.priceCents ?? Infinity);
      if (filters.sort === "priceDesc")
        return (y.priceCents ?? -Infinity) - (x.priceCents ?? -Infinity);
      if (filters.sort === "year")
        return (y.modelYear ?? -Infinity) - (x.modelYear ?? -Infinity);
      if (filters.sort === "mileage")
        return (x.mileage ?? Infinity) - (y.mileage ?? Infinity);
      return (
        Date.parse(y.observedAt) - Date.parse(x.observedAt) ||
        listingKey(x).localeCompare(listingKey(y))
      );
    });
}

export type RadarSavedSearch = {
  id: string;
  criteria: SearchCriteria;
  latest: { sources: SourceResult[]; createdAt: string | Date } | null;
  previousSourceRuns?: { sources: SourceResult[] }[];
  lastSuccessful?: { sources: SourceResult[] } | null;
};
/** Shared read-only projection: source-scoped fallback, exact identities and evidence. */
export function projectRadarOffers(
  radar: RadarView,
  search?: RadarSavedSearch,
) {
  const offers = new Map<string, RadarOffer>();
  const sources: RadarDetail["sources"] = [];
  for (const source of radar.criteria.sources) {
    const latest = search?.latest?.sources.find((s) => s.source === source);
    const previous =
      search?.previousSourceRuns
        ?.flatMap((r) => r.sources)
        .find((s) => s.source === source && s.status === "ok") ??
      search?.lastSuccessful?.sources.find(
        (s) => s.source === source && s.status === "ok",
      );
    const current: SourceResult | undefined =
      latest?.status === "ok" ? latest : previous;
    const historical = current !== latest;
    if (latest)
      sources.push({
        source,
        status: latest.status,
        partial: latest.partial,
        observedAt: latest.observedAt,
        historical: !!current && historical,
      });
    else if (current)
      sources.push({
        source,
        status: current.status,
        partial: current.partial,
        observedAt: current.observedAt,
        historical,
      });
    if (!current) continue;
    for (const listing of current.listings) {
      const matchStatus = listingMatchStatus(listing, radar.criteria);
      if (matchStatus === "incompatible") continue;
      offers.set(listingKey(listing), {
        listing,
        matchStatus,
        historical,
        event:
          matchStatus === "confirmed"
            ? evidencedRadarEvent(listing, radar.notices)
            : null,
      });
    }
  }

  return {
    offers: [...offers.values()],
    sources,
    lastConsultedAt: search?.latest
      ? new Date(search.latest.createdAt).toISOString()
      : null,
  };
}
export function radarSampleSummary(offers: RadarOffer[]) {
  const confirmed = offers.filter((o) => o.matchStatus === "confirmed");
  const prices = confirmed
    .map((o) => o.listing.priceCents)
    .filter((p): p is number => p !== null && p > 0);
  return {
    count: confirmed.length,
    review: offers.length - confirmed.length,
    minimum: prices.length ? Math.min(...prices) : null,
    maximum: prices.length ? Math.max(...prices) : null,
    mean: prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : null,
    pricedCount: prices.length,
  };
}
