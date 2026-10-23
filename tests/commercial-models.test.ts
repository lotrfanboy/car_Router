import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fixture from "./fixtures/commercial-models.json";
import observations from "../src/data/source-model-observations.json";
import {
  commercialCatalog,
  commercialListing,
  normalizeCatalogCriteria,
  validCatalogCriteria,
} from "../src/lib/commercial-models";
import { commercialModelName } from "../src/lib/commercial-names";
import {
  catalogKey,
  catalogSchema,
  resolveCatalogVehicle,
} from "../src/lib/vehicle-catalog";
import {
  eligibility,
  listingMatchStatus,
  searchSchema,
  type Listing,
} from "../src/lib/discovery";
import { planSourceQuery } from "../src/lib/source-query";
import {
  normalizeOlx,
  normalizeReef,
  fetchSource,
} from "../src/lib/discovery-providers";
import { GET } from "../src/app/api/search-options/route";
import { radarEvent } from "../src/lib/radar-events";
import { readVehicleCatalog } from "../src/lib/catalog-store";
import { marketSummary } from "../src/lib/intelligence";
import {
  defaultFilters,
  filterVehicles,
  type Vehicle,
} from "../src/lib/vehicle";

vi.mock("../src/lib/catalog-store", () => ({ readVehicleCatalog: vi.fn() }));
vi.mock("../src/lib/db", () => ({
  db: { olxLocation: { findUnique: vi.fn() } },
}));
const raw = catalogSchema.parse(fixture.catalog);
const catalog = commercialCatalog(raw);
const brand = catalog.brands.find((row) => row.name === "CHEVROLET")!;
const celta = catalog.models.find(
  (row) => row.brandId === brand.id && row.name === "Celta",
)!;
const config = (doors: number) =>
  celta.configurations!.find((row) => row.doors === doors)!;
const criteria = (doors?: 2 | 4) =>
  searchSchema.parse({
    name: "Celta regression",
    brand: brand.name,
    model: celta.name,
    state: "SC",
    version: "",
    yearMin: null,
    yearMax: null,
    priceMax: null,
    mileageMax: null,
    privateOnly: false,
    sources: ["olx", "webmotors"],
    doors,
    catalog: {
      provider: "carrouter",
      revision: catalog.revision,
      brandCode: brand.id,
      brandName: brand.name,
      modelCode: celta.id,
      modelName: celta.name,
      ...(doors
        ? {
            configurationCode: config(doors).id,
            configurationName: config(doors).name,
          }
        : {}),
    },
  });
const legacy = (name = "Celta 2P") => {
  const model = raw.models.find(
    (row) => row.brandId === brand.id && row.name === name,
  )!;
  return searchSchema.parse({
    ...criteria(),
    model: name,
    catalog: {
      provider: "carrouter",
      revision: raw.revision,
      brandCode: brand.id,
      brandName: brand.name,
      modelCode: model.id,
      modelName: name,
    },
  });
};
const optionRequest = (query: string) =>
  new NextRequest(`http://localhost/api/search-options?${query}`);
beforeEach(() => vi.mocked(readVehicleCatalog).mockResolvedValue(catalog));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("commercial identity above technical catalog entries", () => {
  it.each([
    ["CHEVROLET", "Celta", ["Celta 2P", "Celta 4P"]],
    ["CHEVROLET", "Camaro", ["Camaro", "Camaro (2017)"]],
    ["CHEVROLET", "Cobalt", ["Cobalt", "Cobalt (2017)"]],
    ["FIAT", "Palio", ["Palio", "Palio 2P", "Palio 4P", "Novo Palio"]],
    ["HONDA", "Civic", ["Civic", "Civic (2015)"]],
    ["HYUNDAI", "HB20", ["HB20", "HB20 (2016)"]],
    ["RENAULT", "Duster", ["Duster", "Duster (2017)", "Novo Duster"]],
    ["VOLKSWAGEN", "T-Cross", ["T CROSS", "T-Cross"]],
  ])("exposes one %s %s and preserves all member IDs", (make, name, labels) => {
    const parent = catalog.brands.find((row) => row.name === make)!;
    const models = catalog.models.filter(
      (row) => row.brandId === parent.id && row.name === name,
    );
    expect(models).toHaveLength(1);
    for (const label of labels as string[])
      expect(
        catalog.modelAliases?.find(
          (row) => row.name === label && row.modelId === models[0].id,
        ),
      ).toBeDefined();
  });
  it("does not modify evidence or source entries and retains every version identity", () => {
    expect(raw).toEqual(catalogSchema.parse(fixture.catalog));
    expect(catalog.versions.map((row) => row.id).sort()).toEqual(
      raw.versions.map((row) => row.id).sort(),
    );
    const camaro = catalog.models.find((row) => row.name === "Camaro")!;
    expect(
      catalog.versions.filter((row) => row.modelId === camaro.id),
    ).toHaveLength(10);
    expect(commercialCatalog(catalog)).toBe(catalog);
  });
  it.each([
    ["FORD", "Ka", "KA+"],
    ["CHEVROLET", "Onix", "Onix Plus"],
    ["HYUNDAI", "HB20", "HB20S"],
    ["VOLKSWAGEN", "Golf", "Golf Variant"],
    ["RENAULT", "Duster", "Duster Oroch"],
  ])("keeps %s %s distinct from %s", (make, a, b) => {
    expect(commercialModelName(make, a)).not.toBe(commercialModelName(make, b));
  });
  it("never cuts suffixes from a name outside the review list", () => {
    expect(catalogKey("Ka+")).not.toBe(catalogKey("Ka"));
    expect(commercialModelName("Unknown", "Novo Future (2017) 2P")).toBe(
      "Novo Future (2017) 2P",
    );
    expect(commercialModelName("CHEVROLET", "Camaro GT Unknown")).toBe(
      "Camaro GT Unknown",
    );
  });
  it("groups local market models while retaining original vehicle configurations", () => {
    const vehicles = ["Celta 2P", "Celta 4P"].map(
      (model, i) =>
        ({
          id: String(i),
          brand: "CHEVROLET",
          model,
          version: "Life",
          manufactureYear: 2006,
          modelYear: 2006,
          priceCents: 1000000,
          mileage: 100000,
          fuel: "Flex",
          state: "SC",
          source: "olx",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          favorite: false,
        }) as Vehicle,
    );
    expect(marketSummary(vehicles).groups).toMatchObject([
      { model: "Celta", count: 2 },
    ]);
    expect(
      filterVehicles(vehicles, {
        ...defaultFilters,
        model: "Celta",
        exactMatch: true,
      }),
    ).toHaveLength(2);
    expect(
      filterVehicles(vehicles, {
        ...defaultFilters,
        model: "Celta 2P",
        exactMatch: true,
      }),
    ).toHaveLength(1);
    expect(vehicles.map((row) => row.model)).toEqual(["Celta 2P", "Celta 4P"]);
  });
  it("serves commercial models, configurations and versions with validated parents", async () => {
    const options = await (
      await GET(optionRequest(`type=models&brand=${brand.id}`))
    ).json();
    expect(
      options.filter((row: { name: string }) => row.name === "Celta"),
    ).toHaveLength(1);
    expect(
      options.some(
        (row: { name: string }) =>
          row.name === "Celta 2P" || row.name === "Camaro (2017)",
      ),
    ).toBe(false);
    const configurations = await (
      await GET(
        optionRequest(
          `type=configurations&brand=${brand.id}&model=${celta.id}`,
        ),
      )
    ).json();
    expect(
      configurations.map((row: { name: string }) => row.name).sort(),
    ).toEqual(["2 portas", "4 portas"]);
    const camaro = catalog.models.find((row) => row.name === "Camaro")!;
    const variant = camaro.configurations!.find(
      (row) => row.name === "Camaro (2017)",
    )!;
    const versions = await (
      await GET(
        optionRequest(
          `type=versions&brand=${brand.id}&model=${camaro.id}&configuration=${variant.id}`,
        ),
      )
    ).json();
    expect(versions).toHaveLength(2);
    expect(
      (
        await GET(
          optionRequest(
            `type=versions&brand=${brand.id}&model=${celta.id}&configuration=${variant.id}`,
          ),
        )
      ).status,
    ).toBe(400);
  });
  it("adapts old selections with doors and configuration, without changing years or input", () => {
    const old = legacy();
    const before = structuredClone(old);
    const migrated = normalizeCatalogCriteria(catalog, old);
    expect(old).toEqual(before);
    expect(migrated).toMatchObject({
      model: "Celta",
      doors: 2,
      yearMin: null,
      yearMax: null,
      catalog: {
        modelCode: celta.id,
        modelName: "Celta",
        configurationCode: config(2).id,
      },
    });
    expect(validCatalogCriteria(catalog, migrated)).toBe(true);
    const camaro = normalizeCatalogCriteria(catalog, legacy("Camaro (2017)"));
    expect(camaro).toMatchObject({
      model: "Camaro",
      yearMin: null,
      yearMax: null,
      catalog: { configurationName: "Camaro (2017)" },
    });
  });
  it("rejects tampered legacy names, stale revisions and unrelated versions/configurations", () => {
    const old = legacy();
    for (const value of [
      { ...old, model: "Celta forged" },
      { ...old, catalog: { ...old.catalog, revision: "stale" } },
      { ...criteria(2), doors: 4 },
      {
        ...criteria(),
        catalog: {
          ...criteria().catalog,
          configurationCode: "unknown",
          configurationName: "unknown",
        },
      },
    ]) {
      const selected = searchSchema.parse(value);
      expect(planSourceQuery(catalog, "webmotors", selected).query).toBeNull();
    }
  });
});

describe("portal identities and door conventions", () => {
  const listing = (observation: (typeof observations.observations)[number]) => {
    const resolved = resolveCatalogVehicle(catalog, {
      source: observation.source as "olx" | "webmotors",
      brand: observation.brand,
      model: observation.model,
      version: observation.version,
      ...observation.source_identity,
      doors: observation.source === "webmotors" ? 2 : undefined,
    });
    return {
      source: observation.source as "olx" | "webmotors",
      brand: resolved.brand?.name ?? null,
      model: resolved.model?.name ?? null,
      externalId: observation.externalId,
      url: observation.url,
      title: "Recovered model attributes",
      observedAt: observation.observed_at,
      identity: resolved.identity,
      catalogResolution: resolved.classification,
      doors: resolved.doors,
      state: "SC",
      city: null,
      priceCents: 1000000,
      modelYear: 2006,
      mileage: 100000,
      sellerType: "private",
      reasons: [],
    } satisfies Listing;
  };
  it("recognizes observed CELTA and exact OLX descriptions without inventing a trim", () => {
    for (const observation of observations.observations.filter(
      (row) => row.commercialModel === "Celta",
    )) {
      const row = listing(observation);
      expect(row.model).toBe("Celta");
      expect(row.identity?.modelId).toBe(celta.id);
      expect(listingMatchStatus(row, criteria())).toBe("confirmed");
      expect(row.identity?.versionId).toBeUndefined();
      expect(listingMatchStatus(row, criteria(2))).toBe(
        row.doors === 2 ? "confirmed" : "incompatible",
      );
    }
  });
  it("excludes known Corsa/S10 responses from Celta results and radar events", () => {
    for (const observation of observations.observations.filter(
      (row) => row.commercialModel !== "Celta",
    )) {
      const row = listing(observation);
      expect(listingMatchStatus(row, criteria())).toBe("incompatible");
      expect(
        radarEvent(row, criteria(), {
          mode: "new_listings",
          minPercent: 0,
          initialized: true,
        }),
      ).toBeNull();
    }
  });
  it("never extrapolates an observed label to an unseen model or conflicting source ID", () => {
    expect(
      resolveCatalogVehicle(catalog, {
        source: "webmotors",
        brand: "CHEVROLET",
        brandId: "2",
        model: "CELTA",
        modelId: "999",
      }).identity?.modelId,
    ).toBeUndefined();
    expect(
      resolveCatalogVehicle(catalog, {
        source: "olx",
        brand: "CHEVROLET",
        model: "Celta Unknown Wagon",
      }).identity?.modelId,
    ).toBeUndefined();
    expect(
      resolveCatalogVehicle(catalog, {
        source: "webmotors",
        brand: "CHEVROLET",
        brandId: "999",
        model: "CELTA",
        modelId: "1143",
      }).identity?.modelId,
    ).toBeUndefined();
    expect(
      resolveCatalogVehicle(catalog, {
        source: "webmotors",
        brand: "FIAT",
        brandId: "2",
        model: "CELTA",
        modelId: "1143",
      }).identity?.modelId,
    ).toBe(celta.id);
  });
  it("normalizes fresh provider records and historical favorites from source attributes", () => {
    const wm = observations.observations.find(
      (row) => row.source === "webmotors" && row.commercialModel === "Celta",
    )!;
    const [fresh] = normalizeReef(
      {
        listings: [
          {
            listing_id: 1,
            url: wm.url,
            make: wm.brand,
            model: wm.model,
            make_id: wm.source_identity.brandId,
            model_id: wm.source_identity.modelId,
            trim_id: wm.source_identity.versionId,
            trim: wm.version,
            price: 10000,
            year_model: 2006,
            seller: { state_code: "SC", type: "private" },
          },
        ],
      },
      wm.observed_at,
      catalog,
    );
    expect(fresh).toMatchObject({
      model: "Celta",
      doors: 2,
      sourceModel: "CELTA",
    });
    const historical = {
      ...fresh,
      model: "CELTA",
      identity: undefined,
      doors: undefined,
      reasons: ["Marca não classificada", "Modelo não classificado"],
    };
    expect(commercialListing(catalog, historical)).toMatchObject({
      model: "Celta",
      doors: 2,
      identity: { modelId: celta.id },
    });
    expect(eligibility(fresh, criteria(2))).toEqual([]);
    expect(eligibility(fresh, criteria(4))).toContain(
      "Número de portas diferente",
    );
    const olx = observations.observations.find((row) => row.source === "olx")!;
    const [olxRow] = normalizeOlx(
      {
        items: [
          {
            id: "1",
            url: olx.url,
            price: 10000,
            properties: [
              { name: "vehicle_brand", value: olx.brand },
              { name: "vehicle_model", value: olx.model },
            ],
          },
        ],
      },
      olx.observed_at,
      catalog,
    );
    expect(olxRow).toMatchObject({
      model: "Celta",
      doors: 4,
      original: { model: olx.model },
    });
  });
  it.each(["olx", "webmotors"] as const)(
    "sends commercial model labels through the actual %s adapter",
    async (source) => {
      vi.stubEnv("GECKO_API_KEY", "offline-test");
      vi.stubEnv("REEF_API_KEY", "offline-test");
      vi.stubEnv("REEF_FREE_TRIAL", "true");
      const calls: { url: string; body: Record<string, unknown> }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({
            url,
            body: init?.body ? JSON.parse(String(init.body)) : {},
          });
          if (url.endsWith("/credits"))
            return Response.json({ planId: "free", currentCredits: 20 });
          if (url.endsWith("/mcp"))
            return Response.json({
              result: {
                tools: [
                  {
                    name: "olx_com_br_plp",
                    description: "Current cost: 1 credit.",
                  },
                ],
              },
            });
          return Response.json(
            source === "olx"
              ? { data: { items: [], totalResults: 0 } }
              : {
                  ok: true,
                  data: { listings: [], total_results: 0, has_more: false },
                },
          );
        }),
      );
      const selected = legacy();
      const before = structuredClone(selected);
      const result = await fetchSource(
        source,
        selected,
        vi.fn(async () => {}),
      );
      expect(result.status).toBe("ok");
      expect(selected).toEqual(before);
      const collect = calls.find((row) =>
        row.url.endsWith(source === "olx" ? "/extract" : "/search"),
      )!;
      if (source === "olx")
        expect(new URL(String(collect.body.url)).searchParams.get("q")).toBe(
          "Chevrolet Celta",
        );
      else
        expect(collect.body).toMatchObject({
          make: "CHEVROLET",
          model: "CELTA",
        });
      expect(JSON.stringify(collect.body)).not.toMatch(
        /Celta 2P|model_d369|configurationCode|configurationName/,
      );
      expect(collect.body.trim).toBeUndefined();
      expect(result.applied?.local).toContain("número de portas");
    },
  );
});
