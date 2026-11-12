import { describe, expect, it } from "vitest";
import { savedListingsView } from "../src/lib/saved-listing-view";
import type { Listing } from "../src/lib/discovery";
const row = (
  externalId: string,
  priceCents: number | null,
  extra: Partial<Listing> = {},
): Listing => ({
  source: "olx",
  externalId,
  url: `https://example.com/${externalId}`,
  title: "Toyota Corolla",
  brand: "Toyota",
  model: "Corolla",
  modelYear: 2018,
  mileage: 0,
  priceCents,
  city: "São José",
  state: "SC",
  sellerType: "unknown",
  observedAt: "2026-11-03T18:00:00Z",
  reasons: [],
  ...extra,
});
describe("saved listings view", () => {
  it("finds accent-insensitive words across title, location and source without changing saved records", () => {
    const rows = [
      row("one", 8000000),
      row("two", 9000000, { city: "Curitiba", state: "PR" }),
    ];
    expect(
      savedListingsView(rows, "corolla sao SC", "recent").map(
        (x) => x.externalId,
      ),
    ).toEqual(["one"]);
    expect(rows).toHaveLength(2);
    expect(savedListingsView(rows, "", "recent")).toHaveLength(2);
  });
  it("keeps unknown prices last in either price direction and never mutates source ordering", () => {
    const rows = [
      row("unknown", null),
      row("high", 9000000),
      row("low", 8000000),
    ];
    expect(
      savedListingsView(rows, "", "price").map((x) => x.externalId),
    ).toEqual(["low", "high", "unknown"]);
    expect(
      savedListingsView(rows, "", "price-desc").map((x) => x.externalId),
    ).toEqual(["high", "low", "unknown"]);
    expect(rows[0].externalId).toBe("unknown");
  });
  it("does not merge similar ads or lose a vehicle with zero mileage", () => {
    const rows = [
      row("one", 8000000),
      row("two", 8000000),
      row("one", 8000000, { source: "webmotors" }),
    ];
    expect(savedListingsView(rows, "corolla", "price")).toHaveLength(3);
    expect(savedListingsView(rows, "corolla", "recent")[0].mileage).toBe(0);
  });
  it("sorts by observation date rather than pretending saved ads are newly published", () => {
    expect(
      savedListingsView(
        [
          row("old", 9000000),
          row("recent", 8000000, { observedAt: "2026-11-04T10:00:00Z" }),
        ],
        "",
        "recent",
      ).map((x) => x.externalId),
    ).toEqual(["recent", "old"]);
  });
});
