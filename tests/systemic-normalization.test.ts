import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import native from "../src/data/search-catalog.json";
import {
  catalogSchema,
  emptyCatalog,
  resolveCatalogVehicle,
} from "../src/lib/vehicle-catalog";
import {
  mergeSearchCatalog,
  type NativeSearchCatalogSnapshot,
} from "../src/lib/commercial-models";
import {
  searchSchema,
  eligibility,
  listingMatchStatus,
} from "../src/lib/discovery";
import { commercialListing } from "../src/lib/commercial-models";
import fixture from "./fixtures/saved-passat-normalization.json";

const catalog = mergeSearchCatalog(
  catalogSchema.parse(emptyCatalog),
  native as NativeSearchCatalogSnapshot,
);
it("resolves every canonical structured brand independently from an unknown model", () => {
  expect(catalog.brands.length).toBeGreaterThan(100);
  for (const brand of catalog.brands) {
    const result = resolveCatalogVehicle(catalog, {
      source: "olx",
      brand: brand.name,
      model: "Unreviewed technical description",
    });
    expect(result.identity?.brandId, brand.name).toBe(brand.id);
    expect(result.identity?.modelId, brand.name).toBeUndefined();
    expect(result.classification.model).toBe("unresolved");
  }
});
it("does not bypass an unknown provider brand ID or confirm a model from its title/prefix", () => {
  for (const brand of catalog.brands) {
    const result = resolveCatalogVehicle(catalog, {
      source: "olx",
      brand: brand.name,
      brandId: "unreviewed-id",
      model: "Unreviewed technical description",
    });
    expect(result.identity?.brandId).toBeUndefined();
  }
  const row = fixture.sources.find((s) => s.source === "olx")!.listings[0];
  const current = commercialListing(catalog, {
    ...row,
    sourceModel: "Passat UNREVIEWED DESCRIPTION",
    original: { ...row.original, model: "Passat UNREVIEWED DESCRIPTION" },
  } as Parameters<typeof commercialListing>[1]);
  expect(current.identity?.brandId).toBeDefined();
  expect(current.identity?.modelId).toBeUndefined();
  const reasons = eligibility(current, searchSchema.parse(fixture.criteria));
  expect(reasons).not.toContain("Marca não classificada");
  expect(reasons).toContain("Modelo não classificado");
});
it("creates a reusable offline review report and keeps distinct advertisements and price histories separate", () => {
  const dir = mkdtempSync(
    path.join(process.env.RADAR_TEST_ROOT!, "normalization-audit-"),
  );
  const output = path.join(dir, "review.json");
  execFileSync(
    process.execPath,
    [
      "scripts/audit-listing-normalization.mjs",
      "tests/fixtures/saved-passat-normalization.json",
      "--output",
      output,
    ],
    { env: process.env, stdio: "pipe" },
  );
  const report = JSON.parse(readFileSync(output, "utf8"));
  expect(report.automaticChanges).toBe(false);
  expect(report.counts.observations).toBe(56);
  expect(report.counts.sourceIdentities).toBe(56);
  expect(report.repeatedSourceIds).toEqual([]);
  expect(report.repeatedSourceUrls).toEqual([]);
  const nivus = report.descriptions.find((r: { model: string }) =>
    r.model.startsWith("Nivus "),
  );
  expect(nivus).toMatchObject({
    brandInCatalog: true,
    modelCandidates: ["NIVUS"],
    requiresReview: false,
    reviewedCrosswalkStatus: "confirmed",
    suggestionOnly: true,
  });
  const variant = report.descriptions.find((r: { model: string }) =>
    r.model.startsWith("Passat Variant "),
  );
  expect(variant.modelCandidates).toEqual(["PASSAT VARIANT"]);
  const group = report.possibleRelatedOffers.find(
    (g: { offers: { externalId: string }[] }) =>
      g.offers.some((o) => o.externalId === "1520526918"),
  );
  expect(group).toMatchObject({
    sameVehicleConfirmed: false,
    priceDropConfirmed: false,
    status: "unverified",
  });
  expect(group.offers).toHaveLength(4);
  expect(
    new Set(group.offers.map((o: { externalId: string }) => o.externalId)).size,
  ).toBe(4);
  expect(
    new Set(group.offers.map((o: { priceCents: number }) => o.priceCents)).size,
  ).toBe(2);
  expect(
    report.possibleRelatedOffers.some(
      (g: { offers: { source: string }[] }) =>
        new Set(g.offers.map((o) => o.source)).size > 1,
    ),
  ).toBe(true);
});

it("replays every saved Passat source with only the two independently reviewed full labels", () => {
  const criteria = searchSchema.parse(fixture.criteria);
  const before = JSON.stringify(fixture);
  const totals = { confirmed: 0, uncertain: 0, incompatible: 0 };
  for (const source of fixture.sources)
    for (const raw of source.listings) {
      const row = commercialListing(
        catalog,
        raw as Parameters<typeof commercialListing>[1],
      );
      totals[listingMatchStatus(row, criteria)]++;
      if (raw.original.model.startsWith("Nivus ")) {
        expect(row.model).toBe("NIVUS");
        expect(listingMatchStatus(row, criteria)).toBe("incompatible");
      }
      if (raw.original.model === "Passat Highline 2.0 TSI 220cv Tip.") {
        expect(row.model).toBe("Passat");
        expect(row.identity?.versionId).toBeUndefined();
      }
      if (
        raw.original.model.startsWith("Passat CC ") ||
        raw.original.model.startsWith("Passat Variant ")
      )
        expect(row.identity?.modelId).toBeUndefined();
    }
  expect(totals).toEqual({ confirmed: 35, uncertain: 0, incompatible: 21 });
  expect(JSON.stringify(fixture)).toBe(before);
});
