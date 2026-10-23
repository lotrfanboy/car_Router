import { describe, expect, it } from "vitest";
import fixture from "./fixtures/vehicle-catalog.json";
import observations from "./fixtures/catalog-resolver-observations.json";
import { catalogSchema, type VehicleCatalog } from "../src/lib/vehicle-catalog";
import { planSourceQuery } from "../src/lib/source-query";
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

describe("source query planning with incomplete canonical crosswalks", () => {
  it.each(["olx", "webmotors"] as const)(
    "uses approved labels from stored mappings for %s",
    (source) => {
      const data = catalogSchema.parse(observations.catalog);
      const criteria = selection(data);
      const plan = planSourceQuery(data, source, criteria);
      expect(plan.mapping.status).toBe("confirmed");
      expect(plan.query?.brand).toBe("BMW");
      expect(plan.query?.model).toBe(
        data.mappings.find(
          (item) => item.source === source && item.status === "confirmed",
        )?.sourceModelLabel,
      );
      expect(plan.query?.catalog).toEqual(criteria.catalog);
    },
  );

  it.each(["olx", "webmotors"] as const)(
    "can query every fixture model as uncertain text in %s when crosswalks are empty",
    (source) => {
      const data = structuredClone(catalog);
      for (const row of [...data.brands, ...data.models, ...data.versions])
        row.references = [];
      data.mappings = [];
      data.models.forEach((_, index) => {
        const criteria = selection(data, index, true);
        const plan = planSourceQuery(data, source, criteria);
        expect(plan.mapping.status).toBe("uncertain");
        expect(plan.query).toEqual(criteria);
        expect(plan.trim).toBeUndefined();
      });
    },
  );

  it("keeps unapproved versions local in Reef while preserving every requested bound and city", () => {
    const data = catalogSchema.parse(observations.catalog);
    const criteria = selection(data, 0, true);
    const plan = planSourceQuery(data, "webmotors", criteria);
    expect(plan.mapping.status).toBe("uncertain");
    expect(plan.mapping.message).toContain("conferência local");
    expect(plan.trim).toBeUndefined();
    expect(plan.query).toEqual(criteria);
    const upperBoundOnly = { ...criteria, yearMin: null, yearMax: 2024 };
    expect(planSourceQuery(data, "webmotors", upperBoundOnly).query).toEqual(
      upperBoundOnly,
    );
  });

  it("includes a selected version in OLX text and retains the selected location", () => {
    const data = catalogSchema.parse(observations.catalog);
    const criteria = selection(data, 0, true);
    const plan = planSourceQuery(data, "olx", criteria);
    expect(plan.mapping.status).toBe("uncertain");
    const url = new URL(
      buildOlxUrl(plan.query!, "regiao-de-curitiba-e-paranagua"),
    );
    expect(url.searchParams.get("q")).toBe(
      `${plan.query!.brand} ${plan.query!.model} ${criteria.version}`,
    );
    expect(url.pathname).toContain("estado-pr/regiao-de-curitiba-e-paranagua");
    expect(url.searchParams.get("pe")).toBe("200000");
    expect(new URL(buildOlxStateUrl(plan.query!)).searchParams.get("q")).toBe(
      url.searchParams.get("q"),
    );
  });

  it("preserves legacy OLX URLs and accurately reports version as local", () => {
    const criteria = selection(catalog, 0, true);
    criteria.olxUrl =
      "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-pr?q=original";
    const plan = planSourceQuery(catalog, "olx", criteria);
    expect(plan.query?.olxUrl).toBe(criteria.olxUrl);
    expect(plan.mapping.status).toBe("uncertain");
    expect(plan.mapping.message).toContain("URL salva");
    expect(plan.mapping.message).toContain(
      "Versão preservada na conferência local",
    );
  });

  it("translates a confirmed Reef trim only under its related source parents", () => {
    const criteria = selection(catalog, 0, true);
    const plan = planSourceQuery(catalog, "webmotors", criteria);
    expect(plan.mapping.status).toBe("confirmed");
    expect(plan.trim).toBe(
      catalog.versions[0].references.find((ref) => ref.source === "webmotors")
        ?.name,
    );
    const ambiguous = structuredClone(catalog);
    ambiguous.models[0].references.push({
      ...ambiguous.models[0].references[0],
      id: "another-source-model",
      name: "Another source label",
    });
    const uncertain = planSourceQuery(ambiguous, "webmotors", criteria);
    expect(uncertain.mapping.status).toBe("uncertain");
    expect(uncertain.query?.model).toBe(criteria.model);
    expect(uncertain.trim).toBeUndefined();
  });

  it("does not turn mappings under another canonical parent into source filters", () => {
    const data = catalogSchema.parse(observations.catalog);
    data.brands.push({
      id: "unrelated-brand",
      name: "Unrelated",
      references: [],
    });
    data.mappings.forEach((mapping) => {
      mapping.canonicalBrandId = "unrelated-brand";
    });
    const criteria = selection(data);
    const plan = planSourceQuery(data, "olx", criteria);
    expect(plan.mapping.status).toBe("uncertain");
    expect(plan.query).toEqual(criteria);
  });

  it("does not collapse different approved portal spellings into one arbitrary filter", () => {
    const data = structuredClone(catalog);
    data.models[0].references = [
      { ...data.models[0].references[0], id: "first-spelling", name: "A 4" },
      { ...data.models[0].references[0], id: "second-spelling", name: "A4" },
    ];
    const criteria = selection(data);
    const plan = planSourceQuery(data, "webmotors", criteria);
    expect(plan.mapping.status).toBe("uncertain");
    expect(plan.query?.model).toBe(criteria.model);

    // Equal labels require no arbitrary external ID selection for a name query.
    data.models[0].references[1].name = " A 4 ";
    expect(planSourceQuery(data, "webmotors", criteria).query?.model).toBe(
      "A 4",
    );
  });

  it("rejects stale revisions, forged names and incompatible parent selections before collecting", () => {
    const criteria = selection(catalog, 0, true);
    if (criteria.catalog?.provider !== "carrouter")
      throw new Error("Expected catalog selection");
    const invalid = [
      { ...criteria, catalog: { ...criteria.catalog, revision: "obsolete" } },
      { ...criteria, brand: "Forged label" },
      { ...criteria, model: "Forged model" },
      { ...criteria, version: "Forged version" },
      {
        ...criteria,
        catalog: { ...criteria.catalog, modelCode: "wm:model:3" },
      },
      {
        ...criteria,
        catalog: {
          ...criteria.catalog,
          versionCode: catalog.versions.find(
            (item) => item.modelId !== catalog.models[0].id,
          )!.id,
        },
      },
    ];
    for (const input of invalid)
      for (const source of ["olx", "webmotors"] as const) {
        const plan = planSourceQuery(catalog, source, input);
        expect(plan.query).toBeNull();
        expect(plan.mapping.status).toBe("incompatible");
      }
  });
});
