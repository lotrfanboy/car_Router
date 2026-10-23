import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import evidence from "./fixtures/real-provider-model-validation.json";
import nativeSnapshot from "../src/data/search-catalog.json";
import {
  mergeSearchCatalog,
  type NativeSearchCatalogSnapshot,
} from "../src/lib/commercial-models";
import {
  catalogSchema,
  emptyCatalog,
  resolveCatalogVehicle,
} from "../src/lib/vehicle-catalog";
import { normalizeOlx, normalizeReef } from "../src/lib/discovery-providers";
import { planSourceQuery } from "../src/lib/source-query";
import { searchSchema, type Source } from "../src/lib/discovery";
import { buildOlxStateUrl } from "../src/lib/olx-search";
import {
  matchesResultVersion,
  resultVersionFacets,
} from "../src/lib/result-facets";

const technical = catalogSchema.parse({
  ...emptyCatalog,
  revision: "technical-identity-test",
  brands: [{ id: "chevrolet", name: "CHEVROLET" }],
  models: ["Celta 2P", "Celta 4P", "Camaro", "Camaro (2017)"].map(
    (name, i) => ({
      id: `technical-${i}`,
      brandId: "chevrolet",
      name,
    }),
  ),
});
const catalogs = [
  ["native fallback", emptyCatalog],
  ["technical family projection", technical],
] as const;
const scalarId = (value: number | string | null) =>
  value === null ? null : String(value);
const normalize = (
  operation: (typeof evidence.operations)[number],
  catalog: ReturnType<typeof mergeSearchCatalog>,
) => {
  // The runner retained identity fields only. Reconstruct that documented part
  // of each provider envelope without inventing location, price or trim data.
  if (operation.source === "olx")
    return normalizeOlx(
      {
        items: operation.response.records.map((row) => ({
          id: row.id,
          url: row.url,
          properties: Object.entries({
            vehicle_brand: row.brand,
            vehicle_model: row.model,
            vehicle_version: row.version,
            vehicle_brand_id: scalarId(row.brandId),
            vehicle_model_id: scalarId(row.modelId),
            vehicle_version_id: scalarId(row.versionId),
          })
            .filter(([, value]) => value !== null)
            .map(([name, value]) => ({ name, value })),
        })),
      },
      operation.observedAt,
      catalog,
    );
  return normalizeReef(
    {
      listings: operation.response.records.map((row) => ({
        listing_id: row.id,
        url: row.url,
        make: row.brand,
        model: row.model,
        trim: row.version,
        make_id: row.brandId,
        model_id: row.modelId,
        trim_id: row.versionId,
      })),
    },
    operation.observedAt,
    catalog,
  );
};

afterEach(() => vi.unstubAllGlobals());

it("retains the hashes, public identities and declared page counts of all four paid validations", () => {
  expect(evidence.operations).toHaveLength(4);
  expect(
    evidence.operations.reduce((n, op) => n + op.response.received, 0),
  ).toBe(100);
  for (const op of evidence.operations) {
    const body = JSON.stringify(op.response);
    expect(createHash("sha256").update(body).digest("hex")).toBe(op.sha256);
    expect(Buffer.byteLength(body)).toBe(op.bytes);
    expect(op.response.records).toHaveLength(op.response.received);
  }
  expect(
    evidence.operations.map((op) => [
      op.source,
      op.expectedFamily,
      op.response.received,
      op.response.total,
    ]),
  ).toEqual([
    ["olx", "Camaro", 30, 30],
    ["olx", "Celta", 50, 215],
    ["webmotors", "Camaro", 10, 25],
    ["webmotors", "Celta", 10, 76],
  ]);
});

it.each(catalogs)(
  "resolves every reviewed received identity with %s while versions stay independent",
  (_name, base) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("No provider HTTP in identity replay");
      }),
    );
    const catalog = mergeSearchCatalog(
      base,
      nativeSnapshot as NativeSearchCatalogSnapshot,
    );
    for (const op of evidence.operations) {
      const rows = normalize(op, catalog);
      expect(rows).toHaveLength(op.response.received);
      for (const row of rows) {
        expect(row.catalogResolution?.model).toBe("confirmed");
        expect(row.model?.toLowerCase()).toBe(op.expectedFamily.toLowerCase());
        expect(row.identity?.modelId).toBeTruthy();
        expect(row.identity?.versionId).toBeUndefined();
        expect(row.catalogResolution?.version).toBe("unresolved");
      }
      const first = rows[0];
      const brand = catalog.brands.find(
        (brand) => brand.id === first.identity?.brandId,
      )!;
      const model = catalog.models.find(
        (model) => model.id === first.identity?.modelId,
      )!;
      const criteria = searchSchema.parse({
        name: "Replay recorded validation",
        brand: brand.name,
        model: model.name,
        catalog: {
          provider: "carrouter",
          revision: catalog.revision,
          brandCode: brand.id,
          brandName: brand.name,
          modelCode: model.id,
          modelName: model.name,
        },
        state: "PR",
        locationMode: "state",
        yearMin: null,
        yearMax: null,
        priceMax: null,
        mileageMax: null,
        privateOnly: false,
        sources: [op.source],
      });
      const before = planSourceQuery(catalog, op.source as Source, criteria);
      expect(before.queries).toHaveLength(1);
      if (op.source === "webmotors") {
        expect(before.query).toMatchObject({
          brand: op.request.make,
          model: op.request.model,
        });
        expect(op.request).not.toHaveProperty("trim");
      } else {
        expect(
          new URL(buildOlxStateUrl(before.query!)).searchParams
            .get("q")
            ?.toLowerCase(),
        ).toBe(new URL(op.request.url!).searchParams.get("q")?.toLowerCase());
        expect(rows.every((row) => row.version === null)).toBe(true);
      }
      const facets = resultVersionFacets(rows);
      expect(facets.length).toBeGreaterThan(1);
      const subset = rows.filter((row) =>
        matchesResultVersion(row, facets[0].value),
      );
      expect(subset.length).toBeGreaterThan(0);
      expect(subset.length).toBeLessThan(rows.length);
      expect(
        planSourceQuery(catalog, op.source as Source, {
          ...criteria,
          version: facets[0].label,
        }),
      ).toEqual(before);
    }
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("does not generalize observed descriptions to an unseen variant or another brand", () => {
  const catalog = mergeSearchCatalog(
    emptyCatalog,
    nativeSnapshot as NativeSearchCatalogSnapshot,
  );
  for (const observation of [
    {
      source: "olx" as const,
      brand: "Chevrolet",
      model: "Camaro SS 6.2 V8 16V UNREVIEWED",
    },
    { source: "olx" as const, brand: "Ford", model: "Camaro SS 6.2 V8 16V" },
  ]) {
    const resolved = resolveCatalogVehicle(catalog, observation);
    expect(resolved.classification.model).toBe("unresolved");
    expect(resolved.identity?.modelId).toBeUndefined();
  }
});
