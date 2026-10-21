import { expect, it } from "vitest";
import {
  compareListing,
  sortListings,
  validWholeVehiclePrice,
} from "../src/lib/listing-comparison";
import { type Listing, eligibility, searchSchema } from "../src/lib/discovery";
const now = Date.parse("2026-10-21T12:00:00Z");
const listing = (
  id: string,
  price = 14500000,
  overrides: Partial<Listing> = {},
): Listing => ({
  source: "olx",
  externalId: id,
  url: `https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-${id}`,
  title: "Toyota Corolla XEi 2.0",
  brand: "Toyota",
  model: "Corolla",
  version: "XEi 2.0",
  versionOrigin: "explicit",
  modelYear: 2021,
  mileage: 50000,
  city: "Curitiba",
  state: "PR",
  priceCents: price,
  sellerType: "private",
  fuel: "Flex",
  engine: "2.0",
  transmission: "Automático",
  observedAt: new Date(now - 1000).toISOString(),
  reasons: [],
  ...overrides,
});
const target = listing("target", 13000000);
const peers = () =>
  [14000000, 14200000, 14500000, 14800000, 15000000].map((p, i) =>
    listing(`peer-${i}`, p),
  );
it("uses arithmetic mean without budget bias, preserving precision and excluding the target", () => {
  const rows = [target, ...peers()];
  const c = compareListing(target, rows, now);
  expect(c.status).toBe("valid");
  expect(c.count).toBe(5);
  expect(c.meanCents).toBe(14500000);
  expect(c.differenceCents).toBe(1500000);
  expect(c.belowPercent).toBeCloseTo(10.3448275862, 9);
  const criteria = searchSchema.parse({
    name: "test",
    brand: "Toyota",
    model: "Corolla",
    version: "XEi 2.0",
    city: "Curitiba",
    state: "PR",
    yearMin: 2021,
    yearMax: 2021,
    priceMax: 130000,
    mileageMax: null,
    privateOnly: false,
    sources: ["olx"],
    olxUrl: "",
  });
  expect(rows.filter((x) => eligibility(x, criteria).length === 0)).toEqual([
    target,
  ]);
  expect(c.comparables.every((x) => x.priceCents > 13000000)).toBe(true);
});
it("rejects mismatching trims, distant years, mileage, engine, transmission, and states", () => {
  const bad = [
    { version: "Altis" },
    { modelYear: 2018 },
    { mileage: 150000 },
    { engine: "1.8" },
    { transmission: "Manual" },
    { state: "SC" },
  ].map((x, i) => listing(`bad-${i}`, 14500000, x));
  const c = compareListing(target, [...peers(), ...bad], now);
  expect(c.count).toBe(5);
  expect(c.meanCents).toBe(14500000);
});
it("does not count repeated observations, tracking URLs, or copies of the candidate", () => {
  const p = peers();
  const c = compareListing(
    target,
    [
      ...p,
      p[0],
      listing("another-id", 14000000, {
        url: p[0].url + "?utm_source=test#photo",
      }),
      listing("target-copy", 1000000, { url: target.url + "?fbclid=abc" }),
    ],
    now,
  );
  expect(c.count).toBe(5);
  expect(c.meanCents).toBe(14500000);
});
it("excludes uncertain cross-portal duplicates without merging distinct records", () => {
  const p = peers();
  const other = listing("wm", p[0].priceCents!, {
    source: "webmotors",
    url: "https://www.webmotors.com.br/comprar/test/123",
  });
  const c = compareListing(target, [...p, other], now);
  expect(c.excludedPossibleDuplicates).toBe(2);
  expect(c.count).toBe(4);
  expect(c.status).toBe("insufficient");
  expect(c.meanCents).toBeNull();
});
it("requires a sufficient fresh sample, does not infer unknown versions, and rejects invalid prices", () => {
  for (const row of [
    listing("entry", 100000, { title: "Entrada Corolla" }),
    listing("parts", 10000000, { title: "Corolla peças" }),
    listing("zero", 0),
    listing("negative", -1),
    listing("fraction", 10000000.5),
  ])
    expect(validWholeVehiclePrice(row)).toBe(false);
  expect(
    compareListing({ ...target, version: null }, peers(), now).meanCents,
  ).toBeNull();
  const c = compareListing(
    target,
    [
      ...peers().slice(0, 4),
      listing("stale", 14500000, {
        observedAt: new Date(now - 8 * 86400000).toISOString(),
      }),
      listing("future", 14500000, {
        observedAt: new Date(now + 86400000).toISOString(),
      }),
    ],
    now,
  );
  expect(c.count).toBe(4);
  expect(c.belowPercent).toBeNull();
});
it("documents expansion and inferred version and applies deterministic IQR filtering", () => {
  const c = compareListing(
    { ...target, versionOrigin: "inferred" },
    [
      ...peers().map((x) => ({ ...x, city: "Londrina", modelYear: 2022 })),
      listing("outlier", 45000000, { city: "Londrina" }),
    ],
    now,
  );
  expect(c.status).toBe("valid");
  expect(c.excludedOutliers).toBe(1);
  expect(c.meanCents).toBe(14500000);
  expect(c.limitations.join(" ")).toMatch(/inferida/);
  expect(c.limitations.join(" ")).toMatch(/ampliada/);
  expect(c.limitations.join(" ")).toMatch(/vizinhos/);
});
it("reports above-average signs correctly and ranks only valid comparisons first", () => {
  const above = {
    ...listing("above", 16000000),
    comparison: compareListing(listing("above", 16000000), peers(), now),
  };
  const good = { ...target, comparison: compareListing(target, peers(), now) };
  expect(above.comparison.belowPercent).toBeLessThan(0);
  expect(
    sortListings([listing("unknown", 500000), above, good], "discount").map(
      (x) => x.externalId,
    ),
  ).toEqual(["target", "above", "unknown"]);
});
it("preserves fractional mean until presentation and expires references without a new paid call", () => {
  const rows = [10000000, 10000000, 10000000, 10000000, 10000001].map((p, i) =>
    listing(String(i), p),
  );
  // Wider prices avoid an IQR=0 outlier; arithmetic result is not rounded to an integer.
  rows[0].priceCents = 9999999;
  rows[1].priceCents = 9999998;
  const c = compareListing(listing("subject", 9000000), rows, now);
  expect(c.meanCents).toBe(9999999.6);
  expect(compareListing(target, peers(), now + 8 * 86400000).status).toBe(
    "insufficient",
  );
});
