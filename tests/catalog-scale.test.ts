import { expect, it } from "vitest";
import reviewed from "../src/data/commercial-models.json";
import { commercialCatalog } from "../src/lib/commercial-models";
import {
  catalogSchema,
  resolveCatalogVehicle,
} from "../src/lib/vehicle-catalog";

it("indexes a production-sized catalog once when classifying saved-search observations", () => {
  const brands = [
    ...new Set(reviewed.families.map((family) => family.brand)),
  ].map((name, i) => ({ id: `brand-${i}`, name, references: [] }));
  while (brands.length < 63)
    brands.push({
      id: `brand-${brands.length}`,
      name: `Other ${brands.length}`,
      references: [],
    });
  const models = reviewed.families.flatMap((family) =>
    family.members.map((member) => ({
      id: `${family.brand}:${member.label}`,
      name: member.label,
      brandId: brands.find((brand) => brand.name === family.brand)!.id,
      references: [],
    })),
  );
  while (models.length < 1113)
    models.push({
      id: `model-${models.length}`,
      name: `Other ${models.length}`,
      brandId: brands[models.length % brands.length].id,
      references: [],
    });
  const versions = Array.from({ length: 6112 }, (_, i) => ({
    id: `version-${i}`,
    name: `Technical specification ${i}`,
    modelId: models[i % models.length].id,
    references: [],
  }));
  const catalog = commercialCatalog(
    catalogSchema.parse({
      schemaVersion: 1,
      revision: "scale",
      evidence: [],
      brands,
      models,
      versions,
      mappings: [],
    }),
  );
  let versionReads = 0,
    aliasReads = 0;
  const indexed = Object.create(catalog) as typeof catalog;
  Object.defineProperty(indexed, "versions", {
    get: () => {
      versionReads++;
      return catalog.versions;
    },
  });
  Object.defineProperty(indexed, "modelAliases", {
    get: () => {
      aliasReads++;
      return catalog.modelAliases;
    },
  });
  for (let i = 0; i < 8 * 232; i++) {
    const resolved = resolveCatalogVehicle(indexed, {
      source: "olx",
      brand: "CHEVROLET",
      model: i % 2 ? "Celta" : "Celta 4P",
    });
    expect(resolved.model?.name).toBe("Celta");
    if (i % 2 === 0) expect(resolved.doors).toBe(4);
  }
  expect(catalog.versions).toHaveLength(6112);
  // Deterministic complexity check: no repeated full-table scans, independent
  // of runner speed or parallel CI load.
  expect(versionReads).toBe(1);
  expect(aliasReads).toBe(1);
});
