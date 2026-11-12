import type { Listing } from "./discovery";
import { sourceNames } from "./discovery";
import type { Vehicle } from "./vehicle";
import { listingKey } from "./listing-comparison";
import {
  readListingSelection,
  writeListingSelection,
} from "./listing-selection";
import { technicalFacts } from "./technical-facts";
export type CollectionEntry =
  { kind: "listing"; listing: Listing } | { kind: "manual"; vehicle: Vehicle };
export const collectionKey = (entry: CollectionEntry) =>
  entry.kind === "listing"
    ? `listing:${listingKey(entry.listing)}`
    : `manual:${entry.vehicle.id}`;
export const selectionStorageKey = "car-router-collection-comparison-v1";
export function validSelection(keys: unknown): string[] {
  return Array.isArray(keys)
    ? [
        ...new Set(
          keys.filter(
            (key): key is string =>
              typeof key === "string" &&
              /^(manual:.+|listing:(olx|webmotors):.+)$/.test(key),
          ),
        ),
      ].slice(0, 4)
    : [];
}
export function readCollectionSelection(): string[] {
  try {
    const saved = localStorage.getItem(selectionStorageKey);
    if (saved !== null) return validSelection(JSON.parse(saved));
    const listings = readListingSelection().map((key) => `listing:${key}`);
    if (listings.length) return validSelection(listings);
    const manual: unknown = JSON.parse(
      sessionStorage.getItem("radar-comparison") ?? "[]",
    );
    return validSelection(
      Array.isArray(manual)
        ? manual
            .filter((id): id is string => typeof id === "string")
            .map((id) => `manual:${id}`)
        : [],
    );
  } catch {
    return [];
  }
}
export function writeCollectionSelection(keys: string[]) {
  const next = validSelection(keys);
  try {
    localStorage.setItem(selectionStorageKey, JSON.stringify(next));
  } catch {
    /* Optional browser preference. */
  }
  writeListingSelection(
    next.filter((key) => key.startsWith("listing:")).map((key) => key.slice(8)),
  );
}
export function collectionView(entry: CollectionEntry) {
  const row = entry.kind === "listing" ? entry.listing : entry.vehicle;
  const technical = technicalFacts(row);
  return {
    key: collectionKey(entry),
    kind: entry.kind,
    origin: entry.kind === "listing" ? "Salvo da busca" : "Cadastro manual",
    title:
      entry.kind === "listing"
        ? entry.listing.title
        : [entry.vehicle.brand, entry.vehicle.model, entry.vehicle.version]
            .filter(Boolean)
            .join(" "),
    brand: row.brand,
    model: row.model,
    version: row.version ?? null,
    priceCents: row.priceCents,
    modelYear: row.modelYear,
    manufactureYear:
      entry.kind === "manual" ? entry.vehicle.manufactureYear : null,
    mileage: row.mileage,
    city: row.city,
    state: row.state,
    imageUrl: row.imageUrl ?? null,
    url:
      entry.kind === "listing" ? entry.listing.url : entry.vehicle.originalUrl,
    source:
      entry.kind === "listing"
        ? sourceNames[entry.listing.source]
        : entry.vehicle.source,
    seller:
      entry.kind === "manual"
        ? entry.vehicle.sellerType
        : entry.listing.sellerType === "private"
          ? "Particular"
          : entry.listing.sellerType === "professional"
            ? "Profissional"
            : null,
    observedAt:
      entry.kind === "listing"
        ? entry.listing.observedAt
        : (entry.vehicle.priceRecordedAt ??
          entry.vehicle.priceHistory?.at(-1)?.observedAt ??
          null),
    referenceCents:
      entry.kind === "manual" ? entry.vehicle.referenceCents : null,
    notes: entry.kind === "manual" ? entry.vehicle.notes : null,
    technical,
  };
}
export function collectionPath(
  entry: CollectionEntry,
  origin: "salvos" | "comparar" = "salvos",
) {
  return entry.kind === "manual"
    ? `/veiculos/${encodeURIComponent(entry.vehicle.id)}?origem=${origin}`
    : `/anuncios/${entry.listing.source}/${encodeURIComponent(entry.listing.externalId)}?origem=${origin === "comparar" ? "comparar-anuncios" : "salvos"}`;
}
export function collectionHighlights(entries: CollectionEntry[]) {
  const rows = entries.map(collectionView);
  const knownPrices = rows.filter(
    (row) => row.priceCents !== null && row.priceCents > 0,
  );
  const knownMileage = rows.filter(
    (row) => row.mileage !== null && row.mileage >= 0,
  );
  const knownYears = rows.filter((row) => row.modelYear !== null);
  return {
    rows,
    priceCount: knownPrices.length,
    priceRange:
      knownPrices.length > 1
        ? Math.max(...knownPrices.map((r) => r.priceCents!)) -
          Math.min(...knownPrices.map((r) => r.priceCents!))
        : null,
    lowestPrice: knownPrices.length
      ? Math.min(...knownPrices.map((r) => r.priceCents!))
      : null,
    lowestMileage: knownMileage.length
      ? Math.min(...knownMileage.map((r) => r.mileage!))
      : null,
    newestYear: knownYears.length
      ? Math.max(...knownYears.map((r) => r.modelYear!))
      : null,
  };
}
