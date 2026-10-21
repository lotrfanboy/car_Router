import { describe, it, expect } from "vitest";
import {
  defaultFilters,
  vehicleSchema,
  type Vehicle,
} from "../src/lib/vehicle";
import {
  analyzeVehicle,
  analyzeVehicles,
  filterIntelligentVehicles,
  histogramCents,
  marketSummary,
  median,
  medianCents,
  priceRecordDate,
  quantile,
  recentReduction,
  referenceDiscount,
  simulatePurchase,
} from "../src/lib/intelligence";

// Test-only records. No production seed, sample records, or provider calls.
const NOW = Date.parse("2026-10-21T15:00:00Z");
const clock = { now: NOW };
function vehicle(id: string, overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    ...vehicleSchema.parse({
      brand: "Marca teste",
      model: "Modelo teste",
      version: "Versão teste",
      manufactureYear: 2021,
      modelYear: 2022,
      mileage: 40000,
      priceCents: 10000000,
      city: "São Paulo",
      state: "SP",
      fuel: "Flex",
      transmission: "Automático",
      source: "Fonte de teste",
    }),
    id,
    favorite: false,
    createdAt: "2026-10-15T12:00:00Z",
    updatedAt: "2026-10-21T12:00:00Z",
    ...overrides,
  };
}
const peers = (count = 8) =>
  Array.from({ length: count }, (_, index) =>
    vehicle(`peer-${index}`, { priceCents: 9800000 + index * 50000 }),
  );

describe("transparent comparable analysis", () => {
  it("distinguishes missing values from genuine zero and keeps financial units in cents", () => {
    expect(median([])).toBeNull();
    expect(median([NaN, Infinity])).toBeNull();
    expect(median([0, 10])).toBe(5);
    expect(quantile([0, 10, 20, 30], 0.25)).toBe(7.5);
    expect(medianCents([10001, 10002])).toBe(10002);
    expect(medianCents([0, -1, NaN])).toBeNull();
  });

  it("never treats a low manual reference ratio as an opportunity or FIPE", () => {
    const target = vehicle("target", {
      priceCents: 5000000,
      referenceCents: 10000000,
    });
    expect(referenceDiscount(target)).toBe(50);
    const result = analyzeVehicle(target, [target], clock);
    expect(result.classification).toBe("insufficient");
    expect(result.comparablesCount).toBe(0);
    expect(result).not.toHaveProperty("fipe");
  });

  it("requires exact brand/model/version/year/fuel/state and excludes the target", () => {
    const target = vehicle("target", { priceCents: 9000000 });
    const wrong = (["brand", "model", "version", "fuel", "state"] as const).map(
      (field) => vehicle(field, { [field]: "Outro" }),
    );
    wrong.push(vehicle("year", { modelYear: 2023 }));
    const result = analyzeVehicle(
      target,
      [target, ...peers(5), ...wrong],
      clock,
    );
    expect(result.comparablesCount).toBe(5);
    expect(result.comparableIds).not.toContain("target");
    expect(result.classification).toBe("potential");
  });

  it("handles ambiguous identity as insufficient, never as a negative evaluation", () => {
    for (const missing of [
      { version: null },
      { fuel: null },
      { state: null },
    ]) {
      const result = analyzeVehicle(vehicle("target", missing), peers(), clock);
      expect(result.classification).toBe("insufficient");
      expect(result.confidence).toBe("insufficient");
      expect(result.limitations.join(" ")).toContain("identificados");
    }
  });

  it("favorite and other non-price updates cannot refresh an old price", () => {
    const target = vehicle("old", {
      createdAt: "2026-01-01T12:00:00Z",
      updatedAt: "2026-10-21T12:00:00Z",
      favorite: true,
    });
    expect(priceRecordDate(target, clock)).toBe(target.createdAt);
    expect(analyzeVehicle(target, peers(), clock).classification).toBe(
      "insufficient",
    );
    expect(
      analyzeVehicle(
        { ...target, priceRecordedAt: "2026-10-20T12:00:00Z" },
        peers(),
        clock,
      ).classification,
    ).toBe("aligned");
  });

  it("excludes future records and peers exactly 45 days old", () => {
    const target = vehicle("target");
    const universe = [
      ...peers(4),
      vehicle("stale", { createdAt: "2026-09-06T15:00:00Z" }),
      vehicle("future", { createdAt: "2026-11-01T12:00:00Z" }),
    ];
    const result = analyzeVehicle(target, universe, clock);
    expect(result.comparablesCount).toBe(4);
    expect(result.classification).toBe("insufficient");
  });

  it("requires sufficient peers and a recorded reduction for a strong classification", () => {
    const target = vehicle("target", { priceCents: 8500000 });
    expect(analyzeVehicle(target, peers(), clock).classification).toBe(
      "potential",
    );
    target.priceHistory = [
      { observedAt: "2026-10-15T12:00:00Z", priceCents: 9000000 },
      { observedAt: "2026-10-20T12:00:00Z", priceCents: 8500000 },
    ];
    const result = analyzeVehicle(target, peers(), clock);
    expect(result.classification).toBe("strong");
    expect(result.reduction?.amountCents).toBe(500000);
    expect(result.confidence).toBe("high");
    expect(analyzeVehicle(target, peers(5), clock).classification).toBe(
      "potential",
    );
  });

  it("excludes outlier peers using IQR before claiming sample sufficiency", () => {
    const target = vehicle("target", { priceCents: 9500000 });
    const result = analyzeVehicle(
      target,
      [...peers(6), vehicle("outlier", { priceCents: 1000000000 })],
      clock,
    );
    expect(result.comparablesCount).toBe(6);
    expect(result.comparableIds).not.toContain("outlier");
    expect(result.comparableMedianCents).toBe(9925000);
    expect(result.limitations.join(" ")).toContain("extremo");
  });

  it("flags extreme target discounts and highly dispersed cohorts as insufficient", () => {
    expect(
      analyzeVehicle(vehicle("target", { priceCents: 1000000 }), peers(), clock)
        .classification,
    ).toBe("insufficient");
    const dispersed = [
      4000000, 6000000, 8000000, 10000000, 12000000, 14000000,
    ].map((priceCents, index) => vehicle(`p${index}`, { priceCents }));
    expect(
      analyzeVehicle(vehicle("target"), dispersed, clock).classification,
    ).toBe("insufficient");
  });

  it("calculates aligned and above labels from the same reference cohort", () => {
    expect(
      analyzeVehicle(vehicle("target"), peers(), clock).classification,
    ).toBe("aligned");
    expect(
      analyzeVehicle(
        vehicle("target", { priceCents: 11000000 }),
        peers(),
        clock,
      ).classification,
    ).toBe("above");
  });

  it("deduplicates exact listing URLs, ignores trackers, and excludes target copies", () => {
    const target = vehicle("target", {
      originalUrl: "https://example.com/car/1",
    });
    const duplicateTarget = vehicle("copy", {
      originalUrl: "https://example.com/car/1/?utm_source=test#photo",
    });
    const duplicatePeers = Array.from({ length: 8 }, (_, index) =>
      vehicle(`duplicate-${index}`, {
        originalUrl: `https://example.com/car/2?utm_campaign=${index}`,
      }),
    );
    const result = analyzeVehicle(
      target,
      [target, duplicateTarget, ...duplicatePeers, ...peers(3)],
      clock,
    );
    expect(result.comparablesCount).toBe(4);
    expect(result.classification).toBe("insufficient");
    expect(result.comparableIds).not.toContain("copy");
  });

  it("does not merge different listings just because all characteristics match", () => {
    const universe = peers(5).map((item, index) => ({
      ...item,
      originalUrl: `https://example.com/car?id=${index}`,
    }));
    expect(
      analyzeVehicle(vehicle("target"), universe, clock).comparablesCount,
    ).toBe(5);
    expect(
      analyzeVehicle(vehicle("target"), peers(5), clock).comparablesCount,
    ).toBe(5);
  });

  it("bulk calculations match independent leave-one-out analysis without quadratic ID arrays", () => {
    const universe = [
      ...peers(30),
      vehicle("outlier", { priceCents: 1000000000 }),
    ];
    const bulk = analyzeVehicles(universe, clock);
    for (const row of universe) {
      const single = analyzeVehicle(row, universe, clock);
      const compact = bulk.get(row.id)!;
      for (const field of [
        "classification",
        "comparablesCount",
        "comparableMedianCents",
        "discountPercent",
        "percentile",
        "dispersion",
      ] as const)
        expect(compact[field]).toBe(single[field]);
      expect(compact.comparableIds).toEqual([]);
    }
  });

  it("supports documented threshold configuration without changing defaults", () => {
    const target = vehicle("target", { priceCents: 9300000 });
    expect(analyzeVehicle(target, peers(), clock).classification).toBe(
      "potential",
    );
    expect(
      analyzeVehicle(target, peers(), {
        ...clock,
        config: { potentialDiscount: 8 },
      }).classification,
    ).toBe("aligned");
  });

  it("does not cross a classification threshold by rounding the displayed percentage", () => {
    const universe = peers(8).map((row) => ({ ...row, priceCents: 10000000 }));
    const justAbove = vehicle("target", { priceCents: 9500001 });
    expect(analyzeVehicle(justAbove, universe, clock).discountPercent).toBe(5);
    expect(analyzeVehicle(justAbove, universe, clock).classification).toBe(
      "aligned",
    );
    expect(
      analyzeVehicle({ ...justAbove, priceCents: 9500000 }, universe, clock)
        .classification,
    ).toBe("potential");
  });
});

describe("recorded history and financial filters", () => {
  it("uses actual consecutive prices and never refreshes an old reduction with equal observations", () => {
    const target = vehicle("target", {
      priceCents: 9000000,
      priceHistory: [
        { observedAt: "2026-10-01T12:00:00Z", priceCents: 10000000 },
        { observedAt: "2026-10-10T12:00:00Z", priceCents: 9000000 },
        { observedAt: "2026-10-20T12:00:00Z", priceCents: 9000000 },
      ],
    });
    expect(recentReduction(target, clock)).toMatchObject({
      observedAt: "2026-10-10T12:00:00Z",
      percent: 10,
      amountCents: 1000000,
    });
    expect(
      recentReduction({ ...target, priceCents: 9500000 }, clock),
    ).toBeNull();
    expect(
      recentReduction(
        {
          ...target,
          priceHistory: [
            { observedAt: "2026-08-01T12:00:00Z", priceCents: 10000000 },
            { observedAt: "2026-08-10T12:00:00Z", priceCents: 9000000 },
            { observedAt: "2026-10-20T12:00:00Z", priceCents: 9000000 },
          ],
        },
        clock,
      ),
    ).toBeNull();
  });

  it("accepts full detail history without requiring N requests for peer history", () => {
    const target = vehicle("target", { priceCents: 9000000 });
    expect(recentReduction(target, clock)).toBeNull();
    expect(
      recentReduction(target, {
        ...clock,
        histories: {
          target: [
            { observedAt: "2026-10-15T12:00:00Z", priceCents: 10000000 },
            { observedAt: "2026-10-20T12:00:00Z", priceCents: 9000000 },
          ],
        },
      })?.amountCents,
    ).toBe(1000000);
  });

  it("combines real attributes, preserves zero mileage and makes reference filters explicit", () => {
    const rows = [
      vehicle("valid", { mileage: 0, referenceCents: 11000000 }),
      vehicle("missing", { referenceCents: null }),
      vehicle("other", { state: "RJ" }),
    ];
    const result = filterIntelligentVehicles(
      rows,
      {
        ...defaultFilters,
        q: "sao",
        version: "versao",
        fuel: "Flex",
        transmission: "Automático",
        manufactureYear: "2021",
        state: "SP",
        mileageMax: "0",
        referenceDiscountMin: "5",
      },
      clock,
    );
    expect(result.map((row) => row.id)).toEqual(["valid"]);
  });

  it("keeps the full comparable universe when a price filter narrows shown results", () => {
    const target = vehicle("target", { priceCents: 8500000 });
    const universe = [target, ...peers()];
    const filters = {
      ...defaultFilters,
      priceMax: "90000",
      classification: "potential",
    };
    expect(
      filterIntelligentVehicles(universe, filters, clock).map((row) => row.id),
    ).toEqual(["target"]);
    expect(
      filterIntelligentVehicles([target], filters, {
        ...clock,
        universe,
      }).map((row) => row.id),
    ).toEqual(["target"]);
  });

  it("supports exact group drilldown without changing legacy partial text filters", () => {
    const rows = [
      vehicle("gol", { brand: "Volkswagen", model: "Gol" }),
      vehicle("gol-g5", { brand: "Volkswagen", model: "Gol G5" }),
    ];
    expect(
      filterIntelligentVehicles(
        rows,
        { ...defaultFilters, model: "Gol" },
        clock,
      ),
    ).toHaveLength(2);
    expect(
      filterIntelligentVehicles(
        rows,
        {
          ...defaultFilters,
          brand: " volkswagen ",
          model: "gol",
          exactMatch: true,
        },
        clock,
      ).map((row) => row.id),
    ).toEqual(["gol"]);
    expect(
      filterIntelligentVehicles(
        [vehicle("spacing", { brand: "Marca   teste" })],
        { ...defaultFilters, brand: "marca teste", exactMatch: true },
        clock,
      ).map((row) => row.id),
    ).toEqual(["spacing"]);
  });

  it("sorts manual discount and recorded reductions without mutating the dataset", () => {
    const rows = [
      vehicle("none"),
      vehicle("discount", { referenceCents: 12000000 }),
      vehicle("reduction", {
        priceHistory: [
          { observedAt: "2026-10-15T12:00:00Z", priceCents: 11000000 },
          { observedAt: "2026-10-20T12:00:00Z", priceCents: 10000000 },
        ],
      }),
    ];
    expect(
      filterIntelligentVehicles(
        rows,
        { ...defaultFilters, sort: "referenceDiscount" },
        clock,
      )[0].id,
    ).toBe("discount");
    expect(
      filterIntelligentVehicles(
        rows,
        { ...defaultFilters, reduced: true, sort: "reduction" },
        clock,
      ).map((row) => row.id),
    ).toEqual(["reduction"]);
    expect(rows.map((row) => row.id)).toEqual([
      "none",
      "discount",
      "reduction",
    ]);
  });

  it("uses local registration date rather than later edits for the new-record filter", () => {
    const rows = [
      vehicle("old", { createdAt: "2026-01-01T12:00:00Z" }),
      vehicle("new"),
    ];
    expect(
      filterIntelligentVehicles(
        rows,
        { ...defaultFilters, days: "30" },
        clock,
      ).map((row) => row.id),
    ).toEqual(["new"]);
  });
});

describe("market aggregates and money scenarios", () => {
  it("keeps an empty sample genuinely empty", () => {
    const result = marketSummary([], clock);
    expect(result.count).toBe(0);
    expect(result.medianPriceCents).toBeNull();
    expect(result.medianReferenceDiscount).toBeNull();
    expect(result.distribution).toEqual([]);
    expect(result.groups).toEqual([]);
    expect(result.latestPriceRecord).toBeNull();
    expect(result).not.toHaveProperty("history");
  });

  it("uses full comparable cohorts while summarizing only the filtered sample", () => {
    const target = vehicle("target", { priceCents: 8500000 });
    const universe = [target, ...peers()];
    const result = marketSummary([target], { ...clock, universe });
    expect(result.count).toBe(1);
    expect(result.opportunitiesCount).toBe(1);
    expect(result.groups[0].opportunitiesCount).toBe(1);
    expect(result.medianPriceCents).toBe(8500000);
  });

  it("computes manual reference coverage and no false reference for missing values", () => {
    const result = marketSummary(
      [
        vehicle("below", { referenceCents: 12500000 }),
        vehicle("above", { referenceCents: 8000000 }),
        vehicle("missing"),
      ],
      clock,
    );
    expect(result.referenceCount).toBe(2);
    expect(result.belowReferenceCount).toBe(1);
    expect(result.medianReferenceDiscount).toBe(-2.5);
  });

  it("counts every integer-cent histogram value once with explicit inclusive limits", () => {
    const bins = histogramCents([10000, 20000, 30000, 40000], 3);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
    expect(bins.at(-1)?.maxCents).toBe(40000);
    for (let index = 1; index < bins.length; index++)
      expect(bins[index].minCents).toBe(bins[index - 1].maxCents + 1);
    expect(histogramCents([500, 500, 500])).toEqual([
      { minCents: 500, maxCents: 500, count: 3 },
    ]);
    expect(histogramCents([])).toEqual([]);
  });

  it("includes all costs and computes margin on revenue, not return on capital", () => {
    const result = simulatePurchase({
      purchasePriceCents: 8000000,
      salePriceCents: 10000000,
      preparationCents: 200000,
      transportCents: 100000,
      documentationCents: 50000,
      taxesCents: 50000,
      otherCostsCents: 100000,
      targetMargin: 15,
    });
    expect(result).toMatchObject({
      valid: true,
      costsCents: 500000,
      capitalCents: 8500000,
      resultCents: 1500000,
      margin: 15,
      maxPurchasePriceCents: 8000000,
    });
    expect(result.sensitivity[0]).toMatchObject({
      salePriceCents: 9000000,
      resultCents: 500000,
    });
  });

  it("validates money units, rejects invalid inputs and preserves loss/infeasible results", () => {
    const input = { purchasePriceCents: 100, salePriceCents: 100 };
    for (const invalid of [
      { purchasePriceCents: -1 },
      { purchasePriceCents: 1.1 },
      { purchasePriceCents: NaN },
      { salePriceCents: Infinity },
      { targetMargin: 100 },
      { targetMargin: -1 },
      { preparationCents: Number.MAX_SAFE_INTEGER },
    ])
      expect(simulatePurchase({ ...input, ...invalid }).valid).toBe(false);
    expect(simulatePurchase({ ...input, salePriceCents: 0 }).margin).toBeNull();
    expect(
      simulatePurchase({ ...input, preparationCents: 200, targetMargin: 10 })
        .maxPurchasePriceCents,
    ).toBe(-110);
    expect(
      simulatePurchase({ ...input, preparationCents: 200 }).resultCents,
    ).toBe(-200);
  });
});
