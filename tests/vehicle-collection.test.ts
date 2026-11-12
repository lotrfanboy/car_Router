import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectionKey,
  collectionView,
  collectionHighlights,
  collectionPath,
  readCollectionSelection,
  writeCollectionSelection,
  selectionStorageKey,
} from "../src/lib/vehicle-collection";
import type { Listing } from "../src/lib/discovery";
import type { Vehicle } from "../src/lib/vehicle";
const listing: Listing = {
  source: "olx",
  externalId: "same-id",
  url: "https://example.com/same",
  title: "Toyota Corolla",
  brand: "Toyota",
  model: "Corolla",
  version: "2.0 FLEX MANUAL",
  modelYear: 2020,
  mileage: 0,
  priceCents: 8000000,
  city: "Joinville",
  state: "SC",
  sellerType: "unknown",
  observedAt: "2026-11-04T12:00:00Z",
  reasons: [],
};
const manual: Vehicle = {
  id: "same-id",
  brand: "Toyota",
  model: "Corolla",
  version: "XEi",
  manufactureYear: 2019,
  modelYear: 2020,
  mileage: 50000,
  priceCents: 8500000,
  referenceCents: 9000000,
  city: "Joinville",
  state: "SC",
  fuel: "Flex",
  transmission: "Automático",
  source: "Informado pelo usuário",
  sellerType: "Particular",
  originalUrl: listing.url,
  imageUrl: null,
  notes: "Registro manual separado",
  favorite: false,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-11-04T14:00:00Z",
  priceRecordedAt: "2026-11-03T10:00:00Z",
};
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("two origins, distinct entities", () => {
  it("keeps equal IDs and identical URLs in different namespaces", () => {
    expect(collectionKey({ kind: "listing", listing })).toBe(
      "listing:olx:same-id",
    );
    expect(collectionKey({ kind: "manual", vehicle: manual })).toBe(
      "manual:same-id",
    );
    expect(
      collectionHighlights([
        { kind: "listing", listing },
        { kind: "manual", vehicle: manual },
      ]).rows,
    ).toHaveLength(2);
  });
  it("does not invent manufacture, manual reference or notes for a provider listing", () => {
    expect(collectionView({ kind: "listing", listing })).toMatchObject({
      manufactureYear: null,
      referenceCents: null,
      notes: null,
      mileage: 0,
      origin: "Salvo da busca",
    });
    expect(collectionView({ kind: "manual", vehicle: manual })).toMatchObject({
      manufactureYear: 2019,
      referenceCents: 9000000,
      notes: manual.notes,
      observedAt: manual.priceRecordedAt,
    });
  });
  it("does not reinterpret a favorite edit as a new price observation", () => {
    expect(
      collectionView({
        kind: "manual",
        vehicle: { ...manual, updatedAt: "2026-11-05T12:00:00Z" },
      }).observedAt,
    ).toBe("2026-11-03T10:00:00Z");
  });
  it("shows criterion-specific differences and excludes missing data from extrema", () => {
    expect(
      collectionHighlights([
        {
          kind: "listing",
          listing: { ...listing, priceCents: null, mileage: null },
        },
        { kind: "manual", vehicle: manual },
      ]),
    ).toMatchObject({
      priceRange: null,
      lowestPrice: 8500000,
      lowestMileage: 50000,
      newestYear: 2020,
    });
  });
  it("migrates the existing listing preference without deleting it and persists a mixed selection", () => {
    const local = storage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", storage());
    local.setItem(
      "car-router-listing-comparison",
      JSON.stringify(["olx:same-id"]),
    );
    expect(readCollectionSelection()).toEqual(["listing:olx:same-id"]);
    writeCollectionSelection(["listing:olx:same-id", "manual:same-id"]);
    expect(JSON.parse(local.getItem(selectionStorageKey)!)).toEqual([
      "listing:olx:same-id",
      "manual:same-id",
    ]);
    expect(readCollectionSelection()).toEqual([
      "listing:olx:same-id",
      "manual:same-id",
    ]);
  });
  it("limits four distinct records and preserves manual and external return paths", () => {
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
    writeCollectionSelection([
      "manual:a",
      "manual:a",
      "manual:b",
      "listing:olx:c",
      "listing:webmotors:d",
      "manual:e",
      "unexpected:secret",
    ]);
    expect(readCollectionSelection()).toHaveLength(4);
    expect(
      collectionPath({ kind: "manual", vehicle: manual }, "comparar"),
    ).toBe("/veiculos/same-id?origem=comparar");
    expect(collectionPath({ kind: "listing", listing }, "comparar")).toContain(
      "origem=comparar-anuncios",
    );
  });
});
