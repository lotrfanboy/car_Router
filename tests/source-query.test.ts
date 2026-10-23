import { describe, expect, it } from "vitest";
import fixture from "./fixtures/vehicle-catalog.json";
import observations from "./fixtures/catalog-resolver-observations.json";
import { catalogSchema, type VehicleCatalog } from "../src/lib/vehicle-catalog";
import { planSourceQuery } from "../src/lib/source-query";
import { collectionCriteria } from "../src/lib/search-criteria";
import { searchSchema } from "../src/lib/discovery";
import { buildOlxStateUrl, buildOlxUrl } from "../src/lib/olx-search";

const catalog = catalogSchema.parse(fixture);
function selection(data: VehicleCatalog, modelIndex = 0, withVersion = false) {
  const model = data.models[modelIndex];
  const brand = data.brands.find((item) => item.id === model.brandId)!;
  const version = withVersion
    ? data.versions.find((item) => item.modelId === model.id)
    : undefined;
  return searchSchema.parse({
    name: "Offline query planning",
    brand: brand.name,
    model: model.name,
    version: version?.name,
    catalog: {
      provider: "carrouter",
      revision: data.revision,
      brandCode: brand.id,
      brandName: brand.name,
      modelCode: model.id,
      modelName: model.name,
      ...(version
        ? { versionCode: version.id, versionName: version.name }
        : {}),
    },
    state: "PR",
    locationMode: "cities",
    cities: ["Curitiba", "Londrina"],
    yearMin: 2010,
    yearMax: null,
    priceMax: 200000,
    mileageMax: 80000,
    privateOnly: true,
    sources: ["olx", "webmotors"],
  });
}

/** Explicit synthetic outbound contracts, separate from the fixture's ad aliases. */
function withTargets(data = catalog): VehicleCatalog {
  return catalogSchema.parse({
    ...data,
    queryTargets: data.models.map((model) => ({
      id: `test-query:${model.id}`,
      source: "webmotors",
      canonicalBrandId: model.brandId,
      canonicalModelId: model.id,
      sourceBrand: data.brands
        .find((brand) => brand.id === model.brandId)!
        .name.toUpperCase(),
      sourceModel: model.name.toUpperCase(),
      evidenceId: data.evidence[0].id,
      status: "confirmed",
    })),
  });
}

describe("commercial-model collection contracts", () => {
  it("indexes a large immutable catalog once instead of scanning every model for every manual target", () => {
    const data = withTargets();
    const brand = data.brands[0];
    data.models = Array.from({ length: 1000 }, (_, i) => ({
      id: `large-model-${i}`,
      name: `Model ${i}`,
      brandId: brand.id,
      references: [],
    }));
    data.queryTargets = data.models.map((model) => ({
      id: `query-${model.id}`,
      source: "webmotors",
      canonicalBrandId: brand.id,
      canonicalModelId: model.id,
      sourceBrand: brand.name,
      sourceModel: model.name,
      evidenceId: data.evidence[0].id,
      status: "confirmed",
    }));
    const input = { ...selection(data, 999), catalog: undefined };
    let identityReads = 0;
    for (const entity of [...data.brands, ...data.models]) {
      const id = entity.id;
      Object.defineProperty(entity, "id", {
        get: () => {
          identityReads++;
          return id;
        },
      });
    }
    expect(planSourceQuery(data, "webmotors", input).query?.model).toBe(
      "Model 999",
    );
    expect(identityReads).toBeLessThan(10000);
    identityReads = 0;
    for (let i = 0; i < 30; i++)
      expect(planSourceQuery(data, "webmotors", input).queries).toHaveLength(1);
    expect(identityReads).toBeLessThan(300);
  });

  it("does not promote inbound source identities or observed descriptions to outbound query targets", () => {
    for (const data of [catalog, catalogSchema.parse(observations.catalog)]) {
      const plan = planSourceQuery(data, "webmotors", selection(data));
      expect(plan.query).toBeNull();
      expect(plan.queries).toEqual([]);
      expect(plan.mapping.status).toBe("incompatible");
      expect(plan.mapping.message).toContain("Nenhum crédito");
    }
  });

  it("translates only approved outbound labels, independently of version mappings", () => {
    const data = withTargets();
    const criteria = selection(data, 0, true);
    const plan = planSourceQuery(data, "webmotors", criteria);
    expect(plan.mapping.status).toBe("confirmed");
    expect(plan.query).toMatchObject({ brand: "TOYOTA", model: "COROLLA" });
    expect(plan.query).not.toHaveProperty("version");
    expect(plan.query?.catalog).not.toHaveProperty("versionCode");
    expect(plan.trim).toBeUndefined();
    expect(plan.queries).toHaveLength(1);
  });

  it("keeps every explicitly approved native model in a family rather than selecting the first label", () => {
    const data = withTargets();
    data.queryTargets!.push({
      ...data.queryTargets![0],
      id: "test-second-native-model",
      sourceModel: "COROLLA SEDAN", // Synthetic contract, not a production mapping.
    });
    const plan = planSourceQuery(data, "webmotors", selection(data));
    expect(plan.queries.map((query) => query.model)).toEqual([
      "COROLLA",
      "COROLLA SEDAN",
    ]);
    expect(plan.queries.every((query) => query.brand === "TOYOTA")).toBe(true);
    expect(plan.mapping.message).toContain("2 modelos");
    expect(plan.criteria.model).toBe("Corolla");
  });

  it("accepts manual labels only when they identify one family with approved native targets", () => {
    const data = withTargets();
    const criteria = {
      ...selection(data),
      catalog: undefined,
      brand: "toyota",
      model: "corolla",
    };
    const plan = planSourceQuery(data, "webmotors", criteria);
    expect(plan.mapping.status).toBe("confirmed");
    expect(plan.criteria.catalog).toMatchObject({
      provider: "carrouter",
      modelCode: data.models[0].id,
    });
    expect(plan.query?.model).toBe("COROLLA");
    expect(
      planSourceQuery(data, "webmotors", {
        ...criteria,
        model: "unknown spelling",
      }).query,
    ).toBeNull();
    expect(
      planSourceQuery(data, "webmotors", { ...criteria, brand: "Honda" }).query,
    ).toBeNull();
  });

  it("validates a manually typed model under a selected catalog brand", () => {
    const data = withTargets();
    const criteria = selection(data);
    if (criteria.catalog?.provider !== "carrouter")
      throw new Error("Expected canonical selection");
    delete criteria.catalog.modelCode;
    delete criteria.catalog.modelName;
    const plan = planSourceQuery(data, "webmotors", criteria);
    expect(plan.mapping.status).toBe("confirmed");
    expect(plan.criteria.catalog).toMatchObject({
      modelCode: data.models[0].id,
    });
    expect(
      planSourceQuery(data, "webmotors", { ...criteria, model: "Unverified" })
        .query,
    ).toBeNull();
  });

  it("does not choose a family when the same manual name has conflicting approved bindings", () => {
    const data = withTargets();
    const duplicate = {
      ...data.models[0],
      id: "test-conflicting-model",
      name: "Conflicting model",
    };
    data.models.push(duplicate);
    data.queryTargets!.push({
      ...data.queryTargets![0],
      id: "test-conflict",
      canonicalModelId: duplicate.id,
    });
    const plan = planSourceQuery(data, "webmotors", {
      ...selection(data),
      catalog: undefined,
    });
    expect(plan.query).toBeNull();
    expect(plan.mapping.message).toContain("ambígua");
  });

  it("builds OLX keyword searches from the commercial brand/model only, never from an observed full description", () => {
    const data = catalogSchema.parse(observations.catalog);
    const criteria = selection(data, 0, true);
    const plan = planSourceQuery(data, "olx", criteria);
    expect(plan.mapping.status).toBe("uncertain");
    expect(plan.mapping.message).toContain("não comprova cobertura completa");
    const url = new URL(
      buildOlxUrl(plan.query!, "regiao-de-curitiba-e-paranagua"),
    );
    expect(url.searchParams.get("q")).toBe(
      `${criteria.brand} ${criteria.model}`,
    );
    expect(url.pathname).toContain("estado-pr/regiao-de-curitiba-e-paranagua");
    expect(url.searchParams.get("pe")).toBe("200000");
    // The builder itself excludes version, even if another caller supplies it.
    expect(new URL(buildOlxStateUrl(criteria)).searchParams.get("q")).toBe(
      url.searchParams.get("q"),
    );
  });

  it("removes hidden legacy restrictions without mutating the stored criteria", () => {
    const criteria = selection(catalog, 0, true);
    if (criteria.catalog?.provider !== "carrouter")
      throw new Error("Expected canonical selection");
    criteria.doors = 2;
    criteria.catalog.configurationCode = "old-config";
    criteria.catalog.configurationName = "Old technical configuration";
    criteria.olxUrl =
      "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-pr?q=corolla+old+trim";
    const original = structuredClone(criteria);
    const collection = collectionCriteria(criteria);
    expect(collection).not.toHaveProperty("version");
    expect(collection).not.toHaveProperty("doors");
    expect(collection.catalog).not.toHaveProperty("configurationCode");
    expect(collection.catalog).not.toHaveProperty("configurationName");
    expect(collection.catalog).not.toHaveProperty("versionCode");
    expect(collection.catalog).not.toHaveProperty("versionName");
    expect(collection.olxUrl).toBe("");
    expect(collection).toMatchObject({
      state: "PR",
      cities: ["Curitiba", "Londrina"],
      yearMin: 2010,
      priceMax: 200000,
      mileageMax: 80000,
    });
    expect(criteria).toEqual(original);
    expect(collectionCriteria(collection)).toEqual(collection);
  });

  it.each(["olx", "webmotors"] as const)(
    "produces identical %s collection plans when only a local version or configuration changes",
    (source) => {
      const data = withTargets();
      const criteria = selection(data, 0, true);
      const broad = selection(data);
      const narrowed = { ...criteria, doors: 2 as const };
      if (narrowed.catalog?.provider === "carrouter") {
        narrowed.catalog = {
          ...narrowed.catalog,
          configurationCode: "old",
          configurationName: "2 portas",
        };
      }
      expect(planSourceQuery(data, source, narrowed)).toEqual(
        planSourceQuery(data, source, broad),
      );
    },
  );

  it("rejects stale revisions, forged model names and incompatible brand/model parents before collection", () => {
    const data = withTargets();
    const criteria = selection(data);
    if (criteria.catalog?.provider !== "carrouter")
      throw new Error("Expected canonical selection");
    const invalid = [
      { ...criteria, catalog: { ...criteria.catalog, revision: "obsolete" } },
      { ...criteria, brand: "Forged label" },
      { ...criteria, model: "Forged model" },
      {
        ...criteria,
        catalog: { ...criteria.catalog, modelCode: "unknown-model" },
      },
      {
        ...criteria,
        catalog: { ...criteria.catalog, brandCode: data.brands[1].id },
      },
    ];
    for (const input of invalid)
      for (const source of ["olx", "webmotors"] as const) {
        const plan = planSourceQuery(data, source, input);
        expect(plan.query).toBeNull();
        expect(plan.queries).toEqual([]);
        expect(plan.mapping.status).toBe("incompatible");
      }
  });
});
