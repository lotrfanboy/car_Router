import { expect, it } from "vitest";
import type { Listing } from "../src/lib/discovery";
import {
  matchesResultVersion,
  resultVersionFacets,
  unknownVersionFacet,
} from "../src/lib/result-facets";

const listing = (id: string, overrides: Partial<Listing> = {}): Listing => ({
  source: "webmotors",
  externalId: id,
  url: `https://www.webmotors.com.br/comprar/chevrolet/camaro/test/${id}`,
  title: "Camaro",
  brand: "CHEVROLET",
  model: "Camaro",
  version: "2SS",
  versionOrigin: "explicit",
  modelYear: 2020,
  mileage: 50000,
  priceCents: 20000000,
  city: "Curitiba",
  state: "PR",
  sellerType: "private",
  observedAt: "2026-10-23T12:00:00Z",
  reasons: [],
  ...overrides,
});

it("groups formatting duplicates without modifying listings or their technical identity", () => {
  const rows = [
    listing("one", {
      original: {
        brand: "CHEVROLET",
        model: "CAMARO",
        version: " 2SS 6.2L  A - 10 ",
      },
    }),
    listing("two", {
      version: "2ss 6.2l a-10",
      identity: {
        brandId: "chevrolet",
        modelId: "camaro",
        versionId: "separate-technical-id",
      },
    }),
  ];
  // Equal display strings from separately scoped identities are not assumed
  // equivalent; shared search identity is supplied by the catalog resolver.
  rows[0].identity = {
    brandId: "chevrolet",
    modelId: "camaro",
    versionId: "original-technical-id",
  };
  const before = structuredClone(rows);
  const facets = resultVersionFacets(rows);
  expect(facets).toHaveLength(1);
  expect(facets[0].count).toBe(2);
  expect(
    rows.filter((row) => matchesResultVersion(row, facets[0].value)),
  ).toHaveLength(2);
  expect(rows).toEqual(before);
});

it("keeps transmission, engine, and body distinctions visible", () => {
  const rows = [
    listing("eight", { engine: "6.2L", transmission: "A-8" }),
    listing("ten", { engine: "6.2L", transmission: "A-10" }),
    listing("convertible", {
      version: "2SS CONV",
      engine: "6.2L",
      transmission: "A-10",
    }),
    listing("other-engine", { engine: "2.0T", transmission: "A-10" }),
  ];
  const facets = resultVersionFacets(rows);
  expect(facets).toHaveLength(4);
  expect(facets.map((facet) => facet.label)).toContain("2SS · 6.2L · A-8");
  expect(facets.map((facet) => facet.label)).toContain("2SS · 6.2L · A-10");
});

it("offers unknown versions and does not infer a trim from title or missing fields", () => {
  const rows = [
    listing("unknown", { version: null, title: "Camaro 2SS V8" }),
    listing("known"),
  ];
  const facets = resultVersionFacets(rows);
  expect(facets.at(-1)).toEqual({
    value: unknownVersionFacet,
    label: "Não informada",
    count: 1,
  });
  expect(
    rows
      .filter((row) => matchesResultVersion(row, unknownVersionFacet))
      .map((row) => row.externalId),
  ).toEqual(["unknown"]);
  expect(rows.filter((row) => matchesResultVersion(row, ""))).toEqual(rows);
});

it("keeps inferred OLX descriptions separate from explicit portal versions", () => {
  const rows = [
    listing("olx", {
      source: "olx",
      version: "Celta Spirit 1.0",
      sourceModel: "Celta Spirit 1.0",
      versionOrigin: "inferred",
    }),
    listing("explicit", { version: "Celta Spirit 1.0" }),
  ];
  const facets = resultVersionFacets(rows);
  expect(facets).toHaveLength(2);
  expect(
    facets.some((facet) => facet.label === "Celta Spirit 1.0 · descrição OLX"),
  ).toBe(true);
});

it("uses all collected rows before filtering and counts repeated source IDs only once", () => {
  const firstPage = Array.from({ length: 24 }, (_, i) => listing(`first-${i}`));
  const nextPage = [
    listing("next", { version: "50TH" }),
    listing("unknown", { version: null }),
  ];
  const rows = [...firstPage, ...nextPage, firstPage[0]];
  const facets = resultVersionFacets(rows);
  expect(facets.reduce((sum, facet) => sum + facet.count, 0)).toBe(26);
  expect(facets.find((facet) => facet.label === "50TH")?.count).toBe(1);
  expect(facets.find((facet) => facet.label === "2SS")?.count).toBe(24);
});

it("offers a complete OLX source description without inventing a technical trim", () => {
  const row = listing("olx-description", {
    source: "olx",
    model: "Celta",
    version: null,
    versionOrigin: "unknown",
    sourceModel: "Celta Spirit/ LT 1.0 MPFI 8V Flexp. 5P",
    identity: { brandId: "chevrolet", modelId: "celta" },
  });
  const before = structuredClone(row);
  expect(resultVersionFacets([row])[0].label).toBe(
    "Celta Spirit/ LT 1.0 MPFI 8V Flexp. 5P · descrição OLX",
  );
  expect(row).toEqual(before);
  expect(resultVersionFacets([{ ...row, sourceModel: "Celta" }])[0].value).toBe(
    unknownVersionFacet,
  );
});
