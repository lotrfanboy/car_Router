import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  eligibility,
  searchSchema,
  publicListingUrl,
  canonicalBrand,
  canonicalModel,
} from "../src/lib/discovery";
import { normalizeOlx, normalizeReef } from "../src/lib/discovery-providers";
import { buildOlxUrl, regionCandidates } from "../src/lib/olx-search";
import { parseCatalogModels } from "../src/lib/vehicle-catalog";

const root = mkdtempSync(path.join(process.env.RADAR_TEST_ROOT!, "searches-"));
process.env.DATABASE_URL =
  "file:" + path.join(root, "test.db").replaceAll("\\", "/");
const criteria = searchSchema.parse({
  name: "Corolla Curitiba",
  brand: "Toyota",
  model: "Corolla",
  city: "Curitiba",
  state: "PR",
  yearMin: 2020,
  yearMax: 2020,
  priceMax: 120000,
  mileageMax: 60000,
  privateOnly: true,
  sources: ["olx", "webmotors"],
  olxUrl:
    "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/toyota/corolla/estado-pr/regiao-de-curitiba-e-paranagua",
});
const olx = (price = 108000) => ({
  id: "123",
  title: "Toyota Corolla XEi 2020",
  images: [{ webpUrl: "https://img.olx.com.br/test-only-corolla.webp" }],
  url: "https://pr.olx.com.br/regiao-de-curitiba-e-paranagua/autos-e-pecas/carros-vans-e-utilitarios/corolla-123",
  price,
  professionalAd: false,
  location: { city: currentCity, state: currentState },
  properties: [
    { name: "vehicle_brand", value: "Toyota" },
    { name: "vehicle_model", value: "Corolla XEi 2.0" },
    { name: "regdate", value: "2020" },
    { name: "mileage", value: "55822" },
  ],
});
const reef = {
  listing_id: 80767975,
  url: "https://www.webmotors.com.br/comprar/toyota/corolla/xei/4-portas/2020/80767975",
  title: "Toyota Corolla",
  make: "TOYOTA",
  model: "COROLLA",
  year_model: 2020,
  price: 108000,
  mileage_km: 55822,
  seller: {
    type: "private",
    city: "Curitiba",
    state_code: "PR",
    name: "DO NOT PERSIST",
    phones: ["DO NOT PERSIST"],
  },
};
let store: typeof import("../src/lib/discovery-store");
let db: typeof import("../src/lib/db");
let routes: typeof import("../src/app/api/searches/route");
let runRoute: typeof import("../src/app/api/searches/[id]/run/route");
let currentPrice = 108000;
let currentCity = "Curitiba";
let currentState = "PR";
let regions = ["norte-de-santa-catarina"];
let reefFails = false;
const calls: string[] = [];
beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  store = await import("../src/lib/discovery-store");
  db = await import("../src/lib/db");
  routes = await import("../src/app/api/searches/route");
  runRoute = await import("../src/app/api/searches/[id]/run/route");
}, 30000);
beforeEach(async () => {
  await db.db.searchCache.deleteMany();
  await db.db.searchRun.deleteMany();
  await db.db.savedSearch.deleteMany();
  await db.db.discoveredListing.deleteMany();
  await db.db.providerSpend.deleteMany();
  await db.db.searchLock.deleteMany();
  await db.db.olxLocation.deleteMany();
  calls.length = 0;
  currentPrice = 108000;
  currentCity = "Curitiba";
  currentState = "PR";
  regions = ["norte-de-santa-catarina"];
  reefFails = false;
  vi.stubEnv("GECKO_API_KEY", "test-only");
  vi.stubEnv("REEF_API_KEY", "test-only");
  vi.stubEnv("REEF_FREE_TRIAL", "true");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/credits"))
        return Response.json({ planId: "free", currentCredits: 80 });
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
      if (url.endsWith("/extract"))
        return Response.json({
          data: {
            items: [olx(currentPrice), olx(currentPrice)],
            totalResults: 3,
            nextPageUrl: "https://www.olx.com.br/?o=2",
          },
        });
      if (url.endsWith("/locations"))
        return Response.json({
          ok: true,
          data: { regions: regions.map((slug) => ({ slug })) },
        });
      if (reefFails)
        return new Response("provider diagnostic with secret", { status: 503 });
      return Response.json({
        ok: true,
        data: { listings: [reef], total_results: 1, has_more: false },
      });
    }),
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await db.db.$disconnect();
});

it("rejects unsafe source URLs and invalid ranges before any provider access", () => {
  expect(searchSchema.safeParse({ ...criteria, olxUrl: "" }).success).toBe(
    true,
  );
  expect(
    searchSchema.safeParse({
      ...criteria,
      olxUrl:
        "https://www.olx.com.br.evil.test/autos-e-pecas/carros-vans-e-utilitarios",
    }).success,
  ).toBe(false);
  expect(
    searchSchema.safeParse({ ...criteria, yearMin: 2025, yearMax: 2020 })
      .success,
  ).toBe(false);
  expect(publicListingUrl("javascript:alert(1)", "olx")).toBe(false);
  expect(
    publicListingUrl("https://www.webmotors.com.br/solutions/ads", "webmotors"),
  ).toBe(false);
  expect(calls).toHaveLength(0);
});

it("builds a city-scoped OLX URL automatically with encoded search and price", () => {
  const u = new URL(
    buildOlxUrl(
      {
        ...criteria,
        city: "Blumenau",
        state: "SC",
        brand: "BMW",
        model: "320i & teste",
      },
      "norte-de-santa-catarina",
    ),
  );
  expect(u.pathname).toBe(
    "/autos-e-pecas/carros-vans-e-utilitarios/estado-sc/norte-de-santa-catarina/blumenau",
  );
  expect(u.searchParams.get("q")).toBe("BMW 320i & teste");
  expect(u.searchParams.get("pe")).toBe("120000");
  expect(
    new URL(buildOlxUrl(criteria, "regiao-de-curitiba-e-paranagua")).pathname,
  ).toBe(
    "/autos-e-pecas/carros-vans-e-utilitarios/estado-pr/regiao-de-curitiba-e-paranagua",
  );
  expect(
    regionCandidates({
      regions: [
        { slug: "../wrong" },
        { slug: "valid-region" },
        { slug: "valid-region" },
      ],
    }),
  ).toEqual(["valid-region"]);
});

it("resolves a new city on demand, verifies its listings, and caches without another lookup charge", async () => {
  currentCity = "Joinville";
  currentState = "SC";
  const search = await store.saveSearch({
    ...criteria,
    city: "Joinville",
    state: "SC",
    olxUrl: "",
    sources: ["olx"],
  });
  const first = await store.executeSearch(search.id);
  expect(first.sources[0]).toMatchObject({ status: "ok", locationCredits: 1 });
  expect(
    await db.db.olxLocation.findUnique({ where: { id: "SC:joinville" } }),
  ).toMatchObject({ region: "norte-de-santa-catarina" });
  await db.db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
  await db.db.searchCache.deleteMany();
  expect((await store.executeSearch(search.id)).sources[0]).toMatchObject({
    status: "ok",
  });
  expect(calls.filter((url) => url.endsWith("/locations"))).toHaveLength(1);
});

it("does not invent a region or pass off national results as a city search", async () => {
  const search = await store.saveSearch({
    ...criteria,
    city: "Joinville",
    state: "SC",
    olxUrl: "",
    sources: ["olx"],
  });
  regions = ["one-region", "another-region"];
  expect((await store.executeSearch(search.id)).sources[0]).toMatchObject({
    status: "error",
    listings: [],
  });
  expect(calls.some((url) => url.endsWith("/extract"))).toBe(false);
  regions = ["norte-de-santa-catarina"];
  await db.db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
  await db.db.searchCache.deleteMany();
  const second = await store.executeSearch(search.id);
  expect(second.sources[0]).toMatchObject({ status: "error", listings: [] });
  expect(await db.db.olxLocation.count()).toBe(0);
});
it("excludes unknown fields and Corolla Cross, preserves monetary units and strips seller contacts", () => {
  const row = normalizeOlx({ items: [olx()] }, new Date().toISOString())[0];
  expect(row.priceCents).toBe(10800000);
  expect(eligibility(row, criteria)).toEqual([]);
  expect(eligibility({ ...row, model: "Corolla Cross" }, criteria)).toContain(
    "Modelo diferente ou não confirmado",
  );
  expect(
    eligibility(
      { ...row, mileage: null, sellerType: "unknown", city: "Blumenau" },
      criteria,
    ),
  ).toHaveLength(3);
  const safe = normalizeReef(
    {
      listings: [
        reef,
        { ...reef, listing_id: 2, url: "https://malicious.test/" },
      ],
    },
    row.observedAt,
  );
  expect(safe).toHaveLength(1);
  expect(JSON.stringify(safe)).not.toContain("DO NOT PERSIST");
});
it("separates FIPE model labels from the textual query and normalized OLX attributes", () => {
  const family = parseCatalogModels({
    modelos: [
      { codigo: 1, nome: "Corolla XEi 2.0 Flex 16V Aut." },
      { codigo: 2, nome: "Corolla Cross XRE 2.0 16V Flex Aut." },
    ],
  }).find((option) => option.searchName === "Corolla")!;
  const selected = searchSchema.parse({
    ...criteria,
    model: family.searchName,
    version: "",
    olxUrl: "",
    catalog: {
      provider: "fipe",
      brandCode: "59",
      brandName: "Toyota",
      modelCode: family.versions[0].code,
      modelName: family.versions[0].name,
    },
  });
  const row = normalizeOlx({ items: [olx()] }, new Date().toISOString())[0];
  expect(
    eligibility(row, { ...criteria, model: family.versions[0].name }),
  ).toContain("Modelo diferente ou não confirmado");
  expect(eligibility(row, selected)).toEqual([]);
  expect(row).toMatchObject({
    model: "Corolla",
    sourceModel: "Corolla XEi 2.0",
    version: "XEi 2.0",
    versionOrigin: "inferred",
  });
  const url = new URL(buildOlxUrl(selected, "regiao-de-curitiba-e-paranagua"));
  expect(url.searchParams.get("q")).toBe("Toyota Corolla");
  expect(url.toString()).not.toContain("XEi");
  expect(eligibility({ ...row, model: "Corolla Cross" }, selected)).toContain(
    "Modelo diferente ou não confirmado",
  );
  expect(
    searchSchema.safeParse({
      ...selected,
      catalog: { provider: "fipe", brandCode: "59", brandName: "Toyota" },
    }).success,
  ).toBe(true);
  expect(
    searchSchema.safeParse({
      ...selected,
      catalog: {
        provider: "fipe",
        brandCode: "59",
        brandName: "Toyota",
        modelCode: "1",
      },
    }).success,
  ).toBe(false);
});
it("keeps known brand aliases and existing Mercedes C180 matching without broad model matches", () => {
  const row = normalizeOlx({ items: [olx()] }, new Date().toISOString())[0];
  expect(canonicalBrand("Mercedes")).toBe(canonicalBrand("Mercedes-Benz"));
  expect(canonicalModel("C 180")).toBe(canonicalModel("C180"));
  const mercedes = { ...criteria, brand: "Mercedes-Benz", model: "C180" };
  expect(
    eligibility({ ...row, brand: "Mercedes", model: "C 180" }, mercedes),
  ).toEqual([]);
  expect(
    eligibility({ ...row, brand: "Mercedes", model: "C180 Coupé" }, mercedes),
  ).toContain("Modelo diferente ou não confirmado");
  const chevrolet = { ...criteria, brand: "GM - Chevrolet", model: "Onix" };
  expect(
    eligibility({ ...row, brand: "Chevrolet", model: "Onix" }, chevrolet),
  ).toEqual([]);
  expect(
    new URL(
      buildOlxUrl(chevrolet, "regiao-de-curitiba-e-paranagua"),
    ).searchParams.get("q"),
  ).toBe("Chevrolet Onix");
  expect(
    eligibility({ ...row, brand: "GMC", model: "Onix" }, chevrolet),
  ).toContain("Marca diferente ou desconhecida");
});
it("validates the optional local model-group identity separately from FIPE model codes", () => {
  const catalog = {
    provider: "fipe",
    brandCode: "59",
    brandName: "Toyota",
    modelGroup: "family:corolla",
  };
  const selected = searchSchema.parse({ ...criteria, catalog });
  expect(selected.catalog).toEqual(catalog);
  expect(selected.catalog?.modelCode).toBeUndefined();
  expect(selected.model).toBe("Corolla");
  for (const modelGroup of [
    "",
    "family:",
    "family:   ",
    "corolla",
    "fipe:1",
    "family:" + "a".repeat(234),
  ])
    expect(
      searchSchema.safeParse({
        ...criteria,
        catalog: { ...catalog, modelGroup },
      }).success,
    ).toBe(false);
});
it.each([
  ["Grand Cherokee Limited 3.6", "Grand Cherokee", "Limited 3.6"],
  ["Onix Plus LT 1.0", "Onix Plus", "LT 1.0"],
  ["Range Rover Sport 3.0", "Range Rover Sport", "3.0"],
  ["C 180 CGI Avantgarde 1.6", "C 180", "CGI Avantgarde 1.6"],
  ["C180 Avantgarde 1.6", "C180", "Avantgarde 1.6"],
  ["Civic Touring 1.5", "Civic", "Touring 1.5"],
  ["Future Compound Name 1.6", "Future Compound Name", "1.6"],
])(
  "preserves compound model identity and source text for %s",
  (sourceModel, model, version) => {
    const raw = {
      ...olx(),
      properties: olx().properties.map((property) =>
        property.name === "vehicle_model"
          ? { ...property, value: sourceModel }
          : property,
      ),
    };
    const row = normalizeOlx({ items: [raw] }, new Date().toISOString())[0];
    expect(row).toMatchObject({
      sourceModel,
      model,
      version,
      versionOrigin: "inferred",
    });
    expect(row.imageUrl).toBe("https://img.olx.com.br/test-only-corolla.webp");
  },
);
it.each([
  [
    "C 180 Coupé CGI Avantgarde 1.6",
    "C 180 Coupé",
    "C180 Coupe",
    "CGI Avantgarde 1.6",
  ],
  ["C-180 Coupe Avantgarde 1.6", "C-180 Coupe", "C180 Coupé", "Avantgarde 1.6"],
  [
    "C180 Cabriolet Avantgarde 1.6",
    "C180 Cabriolet",
    "C 180 Cabriolet",
    "Avantgarde 1.6",
  ],
  [
    "C 180 Touring Avantgarde 1.6",
    "C 180 Touring",
    "C180 Touring",
    "Avantgarde 1.6",
  ],
  ["C-180 SW Avantgarde 1.6", "C-180 SW", "C180 SW", "Avantgarde 1.6"],
  [
    "C-180 CGI Coupe Avantgarde 1.6",
    "C-180 CGI Coupe",
    "C180 CGI Coupé",
    "Avantgarde 1.6",
  ],
])(
  "does not turn the explicit Mercedes body %s into a sedan",
  (sourceModel, model, query, version) => {
    const raw = {
      ...olx(),
      properties: olx().properties.map((property) =>
        property.name === "vehicle_model"
          ? { ...property, value: sourceModel }
          : property.name === "vehicle_brand"
            ? { ...property, value: "Mercedes" }
            : property,
      ),
    };
    const row = normalizeOlx({ items: [raw] }, new Date().toISOString())[0];
    expect(row).toMatchObject({
      sourceModel,
      model,
      version,
      versionOrigin: "inferred",
    });
    expect(
      eligibility(row, { ...criteria, brand: "Mercedes-Benz", model: "C180" }),
    ).toContain("Modelo diferente ou não confirmado");
    expect(
      eligibility(row, {
        ...criteria,
        brand: "Mercedes-Benz",
        model: query,
        version: "Avantgarde",
      }),
    ).toEqual([]);
    expect(canonicalModel(model)).toBe(canonicalModel(query));
  },
);
it("filters optional versions by whole words, without claiming unavailable attributes", () => {
  const row = normalizeOlx({ items: [olx()] }, new Date().toISOString())[0];
  expect(eligibility(row, { ...criteria, version: "xei" })).toEqual([]);
  expect(eligibility(row, { ...criteria, version: "XE" })).toContain(
    "Versão diferente ou desconhecida",
  );
  expect(
    eligibility({ ...row, version: null }, { ...criteria, version: "xei" }),
  ).toContain("Versão diferente ou desconhecida");
});
it("sends textual model queries to OLX while preserving selected FIPE identity", async () => {
  const catalog = {
    provider: "fipe",
    brandCode: "59",
    brandName: "Toyota",
    modelGroup: "family:corolla",
    modelCode: "1",
    modelName: "Corolla XEi 2.0 Flex 16V Aut.",
  };
  const search = await store.saveSearch({
    ...criteria,
    olxUrl: "",
    catalog,
    sources: ["olx"],
  });
  const result = await store.executeSearch(search.id);
  const extraction = vi
    .mocked(fetch)
    .mock.calls.find(([url]) => String(url).endsWith("/extract"));
  expect(extraction).toBeDefined();
  const payload = JSON.parse(String(extraction![1]?.body));
  expect(Object.keys(payload).sort()).toEqual(["target", "type", "url"]);
  expect(new URL(payload.url).searchParams.get("q")).toBe("Toyota Corolla");
  expect(JSON.stringify(payload)).not.toContain(catalog.modelName);
  expect(JSON.stringify(payload)).not.toContain(catalog.modelGroup);
  expect(result.sources[0].listings[0].reasons).toEqual([]);
  expect((await store.listSearches())[0].criteria.catalog).toEqual(catalog);
});
it("saving and reading searches costs nothing; cross-site POST is rejected", async () => {
  const foreign = new Request("http://localhost:3000/api/searches", {
    method: "POST",
    headers: { origin: "https://other.test" },
    body: JSON.stringify(criteria),
  });
  expect((await routes.POST(foreign)).status).toBe(403);
  const response = await routes.POST(
    new Request("http://localhost:3000/api/searches", {
      method: "POST",
      body: JSON.stringify(criteria),
    }),
  );
  expect(response.status).toBe(201);
  expect((await (await routes.GET()).json()).searches).toHaveLength(1);
  expect(calls).toHaveLength(0);
});
it("persists observations and only changed prices, survives reconnect, and enforces cooldown", async () => {
  const search = await store.saveSearch(criteria);
  const first = await store.executeSearch(search.id);
  expect(first.sources[0]).toMatchObject({
    status: "ok",
    partial: true,
    listings: [
      {
        isNew: true,
        priceCents: 10800000,
        imageUrl: "https://img.olx.com.br/test-only-corolla.webp",
      },
    ],
  });
  expect(first.sources[1].listings[0].reasons).toEqual([]);
  expect(await store.integrationStatus()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "olx",
        lastAttemptStatus: "ok",
        lastSuccessfulAt: expect.any(Date),
      }),
    ]),
  );
  await expect(store.executeSearch(search.id)).rejects.toMatchObject({
    status: 429,
  });
  await db.db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
  await db.db.searchCache.deleteMany();
  await store.executeSearch(search.id);
  expect(await db.db.listingPrice.count()).toBe(2);
  await db.db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
  await db.db.searchCache.deleteMany();
  currentPrice = 103000;
  const third = await store.executeSearch(search.id);
  expect(third.sources[0].listings[0]).toMatchObject({
    isNew: false,
    previousPriceCents: 10800000,
    priceCents: 10300000,
  });
  expect(await db.db.listingPrice.count()).toBe(3);
  await db.db.$disconnect();
  expect(
    (await store.listSearches())[0].latest?.sources[0].listings[0].priceCents,
  ).toBe(10300000);
  const listings = await import("../src/lib/listings-store");
  expect((await listings.getListing("olx", "123"))?.imageUrl).toBe(
    "https://img.olx.com.br/test-only-corolla.webp",
  );
  await db.db.discoveredListing.update({
    where: { source_externalId: { source: "olx", externalId: "123" } },
    data: { savedAt: new Date() },
  });
  await db.db.$disconnect();
  expect((await listings.savedListings())[0].imageUrl).toBe(
    "https://img.olx.com.br/test-only-corolla.webp",
  );
});
it("preserves successful source on partial failure and never leaks provider diagnostics", async () => {
  reefFails = true;
  const search = await store.saveSearch(criteria);
  const result = await store.executeSearch(search.id);
  expect(result.sources[0].listings).toHaveLength(1);
  expect(result.sources[1]).toMatchObject({
    status: "error",
    listings: [],
    creditsReserved: 2,
  });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(calls.filter((x) => x.includes("reefapi"))).toHaveLength(1);
});
it("refuses paid Gecko plans, and blocks extraction when local budget is exhausted", async () => {
  const search = await store.saveSearch({ ...criteria, sources: ["olx"] });
  await db.db.providerSpend.create({
    data: { provider: "gecko", credits: 10 },
  });
  const result = await store.executeSearch(search.id);
  expect(result.sources[0].message).toContain("Orçamento");
  expect(calls.some((x) => x.endsWith("/extract"))).toBe(false);
  calls.length = 0;
  await db.db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
  await db.db.searchCache.deleteMany();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      return Response.json({ planId: "business", currentCredits: 1000 });
    }),
  );
  expect((await store.executeSearch(search.id)).sources[0].message).toContain(
    "plano gratuito",
  );
  expect(calls).toHaveLength(1);
});
it("requires Reef free-trial opt-in and prevents concurrent or cross-site executions", async () => {
  vi.stubEnv("REEF_FREE_TRIAL", "false");
  const search = await store.saveSearch({
    ...criteria,
    sources: ["webmotors"],
  });
  await expect(store.executeSearch(search.id)).rejects.toMatchObject({
    status: 409,
  });
  expect(await db.db.searchRun.count()).toBe(0);
  expect(calls).toHaveLength(0);
  await db.db.searchLock.create({
    data: { id: "manual-search", expiresAt: new Date(Date.now() + 10000) },
  });
  await expect(store.executeSearch(search.id)).rejects.toMatchObject({
    status: 409,
  });
  const res = await runRoute.POST(
    new Request("http://localhost:3000/api/searches/test/run", {
      method: "POST",
      headers: { origin: "https://other.test" },
    }),
    { params: Promise.resolve({ id: search.id }) },
  );
  expect(res.status).toBe(403);
  expect(calls).toHaveLength(0);
});
