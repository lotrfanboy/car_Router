import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fixture from "./fixtures/vehicle-catalog.json";
import {
  catalogSchema,
  catalogKey,
  resolveCatalogVehicle,
  sourceCatalogName,
  parseCatalogCities,
  emptyCatalog,
} from "../src/lib/vehicle-catalog";
import { normalizeOlx, normalizeReef } from "../src/lib/discovery-providers";
import { eligibility, searchSchema } from "../src/lib/discovery";
import { GET } from "../src/app/api/search-options/route";
const state = vi.hoisted(() => ({ empty: false, noVersions: false }));
vi.mock("../src/lib/catalog-store", async () => {
  const { default: data } = await import("./fixtures/vehicle-catalog.json");
  const { catalogSchema, emptyCatalog } =
    await import("../src/lib/vehicle-catalog");
  return {
    readVehicleCatalog: async () =>
      state.empty
        ? emptyCatalog
        : catalogSchema.parse(
            state.noVersions ? { ...data, versions: [] } : data,
          ),
  };
});
const catalog = catalogSchema.parse(fixture);
const request = (query: string) =>
  new NextRequest(`http://localhost/api/search-options?${query}`);
afterEach(() => {
  vi.unstubAllGlobals();
  state.empty = false;
  state.noVersions = false;
});
const criteria = searchSchema.parse({
  name: "Teste",
  brand: "Toyota",
  model: "Corolla",
  state: "PR",
  yearMin: null,
  yearMax: null,
  priceMax: null,
  mileageMax: null,
  privateOnly: false,
  sources: ["olx"],
});

describe("catalog relationships are data, not model-name rules", () => {
  it("keeps decimal specifications distinct and refuses an arbitrary source mapping", () => {
    expect(catalogKey("Engine 1.6")).not.toBe(catalogKey("Engine 16"));
    expect(catalogKey("Engine 1,6")).toBe(catalogKey("Engine 1.6"));
    const model = structuredClone(catalog.models[0]);
    model.references.push({
      ...model.references[0],
      id: "alternative",
      name: "Alternative source name",
    });
    expect(sourceCatalogName(model, "webmotors")).toBeUndefined();
  });
  it.each(catalog.models)(
    "resolves $name via its exact source version record and parent IDs",
    (model) => {
      const brand = catalog.brands.find((item) => item.id === model.brandId)!;
      const version = catalog.versions.find(
        (item) => item.modelId === model.id,
      )!;
      const source = version.references.find((ref) => ref.source === "olx")!;
      const resolved = resolveCatalogVehicle(catalog, {
        source: "olx",
        brand: brand.references.find((ref) => ref.source === "olx")!.name,
        model: source.name,
      });
      expect(resolved?.identity).toEqual({
        brandId: brand.id,
        modelId: model.id,
        versionId: version.id,
      });
    },
  );
  it.each([
    ["Corolla", "Corolla Cross"],
    ["Civic", "Civic Type R"],
    ["Golf", "Golf Variant"],
    ["C180", "C180 Coupé"],
  ])("keeps %s separate from %s", (first, second) => {
    const a = catalog.models.find((item) => item.name === first)!;
    const b = catalog.models.find((item) => item.name === second)!;
    expect(a.id).not.toBe(b.id);
    expect(catalogKey(a.name)).not.toBe(catalogKey(b.name));
    expect(catalog.versions.find((item) => item.modelId === a.id)?.id).not.toBe(
      catalog.versions.find((item) => item.modelId === b.id)?.id,
    );
    const brand = catalog.brands.find((item) => item.id === a.brandId)!;
    const [row] = normalizeReef(
      {
        listings: [
          {
            listing_id: 1,
            url: "https://www.webmotors.com.br/comprar/test/1",
            make: brand.name,
            make_id: brand.references[0].id,
            model: a.name,
            model_id: b.references[0].id,
            price: 100000,
            seller: { state_code: "PR" },
          },
        ],
      },
      new Date().toISOString(),
      catalog,
    );
    const selected = searchSchema.parse({
      ...criteria,
      brand: brand.name,
      model: a.name,
      catalog: {
        provider: "carrouter",
        revision: catalog.revision,
        brandCode: brand.id,
        brandName: brand.name,
        modelCode: a.id,
        modelName: a.name,
      },
    });
    expect(row.model).toBe(b.name);
    expect(eligibility(row, selected)).toContain(
      "Modelo diferente ou não confirmado",
    );
  });
  it("does not slice unknown descriptions or turn a model into a version", () => {
    const [row] = normalizeOlx(
      {
        items: [
          {
            id: "1",
            url: "https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-1",
            properties: [
              { name: "vehicle_brand", value: "Toyota" },
              {
                name: "vehicle_model",
                value: "Future Compound Model 1.6 Sport",
              },
            ],
          },
        ],
      },
      new Date().toISOString(),
      catalog,
    );
    expect(row.model).toBe("Future Compound Model 1.6 Sport");
    expect(row.version).toBeNull();
    expect(row.versionOrigin).toBe("unknown");
    expect(row.original?.model).toBe(row.model);
  });
  it("uses source IDs even when commercial descriptions differ, and rejects conflicting IDs", () => {
    const raw = {
      listing_id: 1,
      url: "https://www.webmotors.com.br/comprar/test/1",
      make: "Commercial brand",
      model: "Different label",
      trim: "Different description",
      make_id: 35,
      model_id: 1,
      trim_id: 1,
      price: 100000,
      year_model: 2020,
      seller: { state_code: "PR", city: "Curitiba" },
      image: "https://image.webmotors.com.br/original.jpg",
    };
    const [row] = normalizeReef(
      { listings: [raw] },
      new Date().toISOString(),
      catalog,
    );
    const selected = searchSchema.parse({
      ...criteria,
      version: catalog.versions[0].name,
      catalog: {
        provider: "carrouter",
        revision: catalog.revision,
        brandCode: catalog.brands[0].id,
        brandName: "Toyota",
        modelCode: catalog.models[0].id,
        modelName: "Corolla",
        versionCode: catalog.versions[0].id,
        versionName: catalog.versions[0].name,
      },
    });
    expect(eligibility(row, selected)).toEqual([]);
    expect(row.original).toMatchObject({
      brand: raw.make,
      model: raw.model,
      version: raw.trim,
    });
    expect(row.original?.fields).toMatchObject({
      make_id: raw.make_id,
      trim_id: raw.trim_id,
      image: raw.image,
      year_model: raw.year_model,
    });
    expect(row.imageUrl).toBe(raw.image);
    const [wrong] = normalizeReef(
      { listings: [{ ...raw, model: "Corolla", model_id: 999 }] },
      row.observedAt,
      catalog,
    );
    expect(eligibility(wrong, selected)).toContain(
      "Modelo diferente ou não confirmado",
    );
  });
  it("fails closed on ambiguous labels and conflicting parent/source identifiers", () => {
    const data = structuredClone(catalog);
    data.models[1].references[0].aliases.push("Corolla");
    expect(
      resolveCatalogVehicle(data, {
        source: "webmotors",
        brand: "Toyota",
        model: "Corolla",
      })?.model,
    ).toBeUndefined();
    data.models[0].brandId = "unknown";
    expect(catalogSchema.safeParse(data).success).toBe(false);
    const duplicate = structuredClone(catalog);
    duplicate.models[1].references[0].id = duplicate.models[0].references[0].id;
    expect(catalogSchema.safeParse(duplicate).success).toBe(false);
  });
  it("requires provenance, and never accepts FIPE descriptions as model identities", () => {
    const data = structuredClone(catalog);
    data.evidence = [];
    expect(catalogSchema.safeParse(data).success).toBe(false);
    const fipe = structuredClone(catalog);
    fipe.models[0].references[0].source = "fipe";
    expect(catalogSchema.safeParse(fipe).success).toBe(false);
    expect(catalogSchema.parse(emptyCatalog).models).toEqual([]);
  });
});

describe("catalog endpoints do not collect listings", () => {
  it("serves brands, models and versions locally, regardless of year", async () => {
    const fetcher = vi.fn(() => {
      throw new Error("Network must not run");
    });
    vi.stubGlobal("fetch", fetcher);
    const brands = await (await GET(request("type=brands"))).json();
    const models = await (
      await GET(
        request(
          `type=models&brand=${brands.find((item: { name: string }) => item.name === "Toyota").code}`,
        ),
      )
    ).json();
    expect(models.map((item: { name: string }) => item.name)).toEqual([
      "Corolla",
      "Corolla Cross",
    ]);
    const query = `type=versions&brand=wm:brand:35&model=wm:model:1`;
    expect(await (await GET(request(query))).json()).toEqual(
      await (await GET(request(query + "&year=1901"))).json(),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects a version request under another brand and obsolete year-catalog calls", async () => {
    expect(
      (await GET(request("type=versions&brand=wm:brand:25&model=wm:model:1")))
        .status,
    ).toBe(400);
    expect((await GET(request("type=years&brand=35"))).status).toBe(400);
  });
  it("distinguishes missing catalog, empty versions and integration failure", async () => {
    state.noVersions = true;
    const empty = await GET(
      request("type=versions&brand=wm:brand:35&model=wm:model:1"),
    );
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);
    state.empty = true;
    expect((await GET(request("type=brands"))).status).toBe(503);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("IBGE unavailable")),
    );
    expect((await GET(request("type=cities&state=PR"))).status).toBe(503);
  });
  it("parses IBGE codes and rejects invalid states before fetching", async () => {
    expect(parseCatalogCities([{ id: 4106902, nome: "Curitiba" }])).toEqual([
      { code: "4106902", name: "Curitiba" },
    ]);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await GET(request("type=cities&state=INVALID"))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
