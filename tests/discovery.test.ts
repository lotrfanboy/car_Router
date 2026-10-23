import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  eligibility,
  searchSchema,
  publicListingUrl,
} from "../src/lib/discovery";
import {
  normalizeOlx as normalizeOlxSource,
  normalizeReef,
} from "../src/lib/discovery-providers";
import {
  buildOlxStateUrl,
  buildOlxUrl,
  regionCandidates,
} from "../src/lib/olx-search";
import fixture from "./fixtures/vehicle-catalog.json";
import { catalogSchema } from "../src/lib/vehicle-catalog";
const catalogFixture = catalogSchema.parse(fixture);
const queryFixtureState = vi.hoisted(() => ({
  extraTarget: false,
  noTargets: false,
}));
const normalizeOlx = (value: unknown, observedAt: string) =>
  normalizeOlxSource(value, observedAt, catalogFixture);
vi.mock("../src/lib/catalog-store", async () => {
  const { default: data } = await import("./fixtures/vehicle-catalog.json");
  const { catalogSchema } = await import("../src/lib/vehicle-catalog");
  return {
    readVehicleCatalog: async () =>
      catalogSchema.parse({
        ...data,
        // Explicit synthetic query contract, independently declared from ad references.
        queryTargets: queryFixtureState.noTargets
          ? []
          : [
              {
                id: "test-corolla-query",
                source: "webmotors",
                canonicalBrandId: data.brands[0].id,
                canonicalModelId: data.models[0].id,
                sourceBrand: "TOYOTA",
                sourceModel: "COROLLA",
                evidenceId: data.evidence[0].id,
                status: "confirmed",
              },
              ...(queryFixtureState.extraTarget
                ? [
                    {
                      id: "test-corolla-secondary-query",
                      source: "webmotors",
                      canonicalBrandId: data.brands[0].id,
                      canonicalModelId: data.models[0].id,
                      sourceBrand: "TOYOTA",
                      sourceModel: "COROLLA SEDAN",
                      evidenceId: data.evidence[0].id,
                      status: "confirmed",
                    },
                  ]
                : []),
            ],
      }),
  };
});

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
  await db.db.providerOperation.deleteMany();
  await db.db.searchLock.deleteMany();
  await db.db.olxLocation.deleteMany();
  calls.length = 0;
  currentPrice = 108000;
  currentCity = "Curitiba";
  currentState = "PR";
  regions = ["norte-de-santa-catarina"];
  reefFails = false;
  queryFixtureState.extraTarget = false;
  queryFixtureState.noTargets = false;
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

it("builds an honest state-wide OLX URL and accepts every selected city", () => {
  const statewide = searchSchema.parse({
    ...criteria,
    locationMode: "state",
    city: "",
    cities: [],
    state: "SC",
    olxUrl: "",
  });
  expect(new URL(buildOlxStateUrl(statewide)).pathname).toBe(
    "/autos-e-pecas/carros-vans-e-utilitarios/estado-sc",
  );
  const multiple = searchSchema.parse({
    ...criteria,
    locationMode: "cities",
    city: "Blumenau",
    cities: ["Blumenau", "Gaspar"],
    state: "SC",
  });
  const row = normalizeOlx(
    {
      items: [
        {
          ...olx(),
          location: { city: "Gaspar", state: "SC" },
          properties: olx().properties.map((property) =>
            property.name === "vehicle_brand"
              ? { ...property, value: "Toyota" }
              : property,
          ),
        },
      ],
    },
    new Date().toISOString(),
  )[0];
  expect(eligibility(row, multiple)).toEqual([]);
  expect(eligibility({ ...row, city: "Joinville" }, multiple)).toContain(
    "Fora da abrangência selecionada ou localização desconhecida",
  );
  expect(eligibility({ ...row, city: "Joinville" }, statewide)).toEqual([]);
});

it("resolves a new city on demand, verifies its listings, and caches without another lookup charge", async () => {
  currentCity = "Joinville";
  currentState = "SC";
  const search = await store.saveSearch({
    ...criteria,
    city: "Joinville",
    cities: ["Joinville"],
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
    cities: ["Joinville"],
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
  expect(second.sources[0].status).toBe("ok");
  expect(
    second.sources[0].listings.every((row) =>
      row.reasons.includes(
        "Fora da abrangência selecionada ou localização desconhecida",
      ),
    ),
  ).toBe(true);
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
it("keeps a Webmotors photo supplied in Reef media collections", () => {
  const [row] = normalizeReef(
    {
      listings: [
        {
          ...reef,
          images: [
            { url: "javascript:alert(1)" },
            { webpUrl: "https://image.webmotors.com.br/c180.webp" },
          ],
        },
      ],
    },
    new Date().toISOString(),
  );
  expect(row.imageUrl).toBe("https://image.webmotors.com.br/c180.webp");
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
it("keeps version selection out of collection eligibility", () => {
  const row = normalizeOlx({ items: [olx()] }, new Date().toISOString())[0];
  expect(eligibility(row, { ...criteria, version: "xei" })).toEqual([]);
  expect(eligibility(row, { ...criteria, version: "XE" })).toEqual([]);
  expect(
    eligibility({ ...row, version: null }, { ...criteria, version: "xei" }),
  ).toEqual([]);
});
it("migrates a validated FIPE-era family before sending a broad textual model query to OLX", async () => {
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
  // The fixture's full OLX description has no reviewed inbound alias; a valid
  // outbound family cannot turn that returned text into a confirmed identity.
  expect(result.sources[0].listings[0].sourceModel).toBe("Corolla XEi 2.0");
  expect(result.sources[0].listings[0].reasons).toEqual([
    "Modelo não classificado",
  ]);
  expect((await store.listSearches())[0].criteria.catalog).toEqual({
    provider: "carrouter",
    revision: catalogFixture.revision,
    brandCode: catalogFixture.brands[0].id,
    brandName: catalogFixture.brands[0].name,
    modelCode: catalogFixture.models[0].id,
    modelName: catalogFixture.models[0].name,
  });
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
it("separates the completed catalog batch from a bounded manual allowance", async () => {
  for (const [provider, validationCredits, supplement] of [
    ["gecko", 2, 2],
    ["reef", 5, 4],
  ] as const) {
    await db.db.providerSpend.createMany({
      data: [
        { provider, credits: 10 },
        { provider, credits: validationCredits },
      ],
    });
    await db.db.providerOperation.create({
      data: {
        id: `catalog-${provider}`,
        batchId: "search-catalog-20261023",
        kind: "validation",
        provider,
        status: "succeeded",
        credits: validationCredits,
        request: "{}",
        completedAt: new Date(),
      },
    });
    const status = (await store.integrationStatus()).find(
      (item) => item.source === (provider === "gecko" ? "olx" : "webmotors"),
    );
    expect(status).toMatchObject({
      reservedToday: 10,
      dailyLimit: 10 + supplement,
    });
    await expect(
      store.reserveCredits(provider, 1, "scheduled"),
    ).rejects.toMatchObject({ status: 429 });
    await store.reserveCredits(provider, supplement);
    await expect(store.reserveCredits(provider, 1)).rejects.toMatchObject({
      status: 429,
    });
    expect(
      await db.db.providerSpend.aggregate({
        where: { provider },
        _sum: { credits: true },
      }),
    ).toMatchObject({ _sum: { credits: 10 + validationCredits + supplement } });
  }
  expect(calls).toHaveLength(0);
});
it("keeps the normal daily cap when no catalog validation completed today", async () => {
  await db.db.providerSpend.create({
    data: { provider: "gecko", credits: 10 },
  });
  await expect(store.reserveCredits("gecko", 1)).rejects.toMatchObject({
    status: 429,
  });
  expect(calls).toHaveLength(0);
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

it("keeps optional year bounds independent and rejects invalid values without adjustment", () => {
  for (const [yearMin, yearMax] of [
    [null, null],
    [1901, null],
    [null, 2099],
    [1901, 1901],
  ]) {
    expect(searchSchema.parse({ ...criteria, yearMin, yearMax })).toMatchObject(
      { yearMin, yearMax, brand: criteria.brand, model: criteria.model },
    );
  }
  for (const [yearMin, yearMax] of [
    [2025, 2020],
    [2020.5, null],
    ["2020", null],
    [1899, null],
    [null, 2101],
  ]) {
    expect(
      searchSchema.safeParse({ ...criteria, yearMin, yearMax }).success,
    ).toBe(false);
  }
  expect(calls).toHaveLength(0);
});

it("round-trips catalog IDs and optional cities, including legacy saved city searches", async () => {
  const catalog = {
    provider: "carrouter",
    revision: catalogFixture.revision,
    brandCode: catalogFixture.brands[0].id,
    brandName: catalogFixture.brands[0].name,
    modelCode: catalogFixture.models[0].id,
    modelName: catalogFixture.models[0].name,
    versionCode: catalogFixture.versions[0].id,
    versionName: catalogFixture.versions[0].name,
  };
  for (const cities of [[], ["Curitiba"], ["Curitiba", "Londrina"]]) {
    const saved = await store.saveSearch({
      ...criteria,
      city: "",
      cities,
      locationMode: undefined,
      version: catalog.versionName,
      catalog,
    });
    expect(searchSchema.parse(JSON.parse(saved.criteria))).toMatchObject({
      catalog: {
        provider: catalog.provider,
        revision: catalog.revision,
        brandCode: catalog.brandCode,
        brandName: catalog.brandName,
        modelCode: catalog.modelCode,
        modelName: catalog.modelName,
      },
      cities,
      city: cities[0] ?? "",
      locationMode: cities.length ? "cities" : "state",
    });
  }
  expect(
    searchSchema.parse({
      ...criteria,
      cities: undefined,
      locationMode: undefined,
    }),
  ).toMatchObject({ cities: ["Curitiba"], locationMode: "cities" });
  expect(
    searchSchema.parse({
      ...criteria,
      cities: ["Londrina"],
      locationMode: "state",
    }),
  ).toMatchObject({ city: "", cities: [], locationMode: "state" });
  await expect(
    store.saveSearch({
      ...criteria,
      catalog: { ...catalog, modelCode: catalogFixture.models[2].id },
    }),
  ).rejects.toThrow("catálogo");
  await expect(
    store.saveSearch({
      ...criteria,
      catalog: { ...catalog, brandName: "forged" },
    }),
  ).rejects.toThrow("catálogo");
  expect(calls).toHaveLength(0);
});

it("translates catalog selections to approved source names without version, doors or configuration filters", async () => {
  const { fetchSource } = await import("../src/lib/discovery-providers");
  const model = catalogFixture.models[0],
    brand = catalogFixture.brands[0],
    version = catalogFixture.versions[0];
  let body: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json({
        ok: true,
        data: { listings: [] },
        meta: { total_results: 0, pagination: { has_more: false } },
      });
    }),
  );
  const selection = searchSchema.parse({
    ...criteria,
    version: version.name,
    city: "",
    cities: [],
    locationMode: "state",
    catalog: {
      provider: "carrouter",
      revision: catalogFixture.revision,
      brandCode: brand.id,
      brandName: brand.name,
      modelCode: model.id,
      modelName: model.name,
      versionCode: version.id,
      versionName: version.name,
    },
  });
  const result = await fetchSource("webmotors", selection, vi.fn());
  expect(body).toMatchObject({
    make: brand.references[0].name,
    model: model.references[0].name,
    year_min: 2020,
    year_max: 2020,
    price_max: 120000,
    mileage_max: 60000,
    seller_type: "private",
    location: "pr",
  });
  expect(result).toMatchObject({
    status: "ok",
    total: 0,
    received: 0,
    listings: [],
    partial: false,
  });
  expect(body).not.toHaveProperty("trim");
  expect(body).not.toHaveProperty("doors");
  expect(body).not.toHaveProperty("configuration");
  expect(result.applied?.remote).not.toContain("versão");
  expect(result.applied?.local).toContain("ano");
});

it("accounts for invalid records, duplicates and eligibility rejections separately", async () => {
  const { fetchSource } = await import("../src/lib/discovery-providers");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          listings: [
            reef,
            reef,
            { ...reef, listing_id: 2, url: "https://invalid.test/" },
            { ...reef, listing_id: 3, year_model: 2019 },
          ],
          total_results: 4,
          has_more: false,
        },
      }),
    ),
  );
  const result = await fetchSource("webmotors", criteria, vi.fn());
  expect(result).toMatchObject({
    status: "ok",
    received: 4,
    partial: false,
    normalizationDiscards: {
      "Identificador ou URL de anúncio inválido": 1,
      "Anúncio duplicado na resposta": 1,
    },
  });
  expect(result.listings.filter((row) => !row.reasons.length)).toHaveLength(1);
  expect(result.listings[1].reasons).toContain(
    "Ano fora do intervalo ou desconhecido",
  );
  expect(result.applied?.remote).not.toContain("versão");
});

it("reports malformed integration data as failure and invalid catalog identity before a billed call", async () => {
  const { fetchSource } = await import("../src/lib/discovery-providers");
  const fetcher = vi.fn(async () => Response.json({ ok: true, data: {} }));
  vi.stubGlobal("fetch", fetcher);
  expect((await fetchSource("webmotors", criteria, vi.fn())).status).toBe(
    "error",
  );
  fetcher.mockClear();
  const reserve = vi.fn();
  const result = await fetchSource(
    "webmotors",
    {
      ...criteria,
      catalog: {
        provider: "carrouter",
        revision: "missing",
        brandCode: "unknown",
        brandName: criteria.brand,
      },
    },
    reserve,
  );
  expect(result.status).toBe("error");
  expect(result.message).toContain("incompatível");
  expect(fetcher).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
});

it("collects every approved native model across selected cities without replanning translated labels", async () => {
  const { fetchSource } = await import("../src/lib/discovery-providers");
  queryFixtureState.extraTarget = true;
  const requestBodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requestBodies.push(body);
      return Response.json({
        ok: true,
        data: { listings: [reef], total_results: 1, has_more: false },
      });
    }),
  );
  const reserve = vi.fn();
  const result = await fetchSource(
    "webmotors",
    searchSchema.parse({
      ...criteria,
      cities: ["Curitiba", "Londrina"],
      version: "do not send this trim",
      doors: 2,
    }),
    reserve,
  );
  expect(requestBodies.map((body) => [body.model, body.location])).toEqual([
    ["COROLLA", "pr-curitiba"],
    ["COROLLA SEDAN", "pr-curitiba"],
    ["COROLLA", "pr-londrina"],
    ["COROLLA SEDAN", "pr-londrina"],
  ]);
  expect(
    requestBodies.every((body) => !("trim" in body) && !("doors" in body)),
  ).toBe(true);
  expect(reserve).toHaveBeenCalledTimes(4);
  expect(result).toMatchObject({
    status: "ok",
    creditsReserved: 8,
    received: 4,
    total: null,
    partial: false,
    normalizationDiscards: { "Anúncio repetido entre consultas": 3 },
  });
  expect(result.listings).toHaveLength(1);
  expect(result.listings[0].reasons).toEqual([]);
  expect(result.targets).toHaveLength(4);
  expect(result.message).toContain("4 de 4 consultas");
});

it("retains successful native targets and marks the family partial when the budget blocks a remaining target", async () => {
  const { fetchSource } = await import("../src/lib/discovery-providers");
  queryFixtureState.extraTarget = true;
  const requestBodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      requestBodies.push(JSON.parse(String(init.body)));
      return Response.json({
        ok: true,
        data: { listings: [reef], total_results: 1, has_more: false },
      });
    }),
  );
  const reserve = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Orçamento gratuito local atingido."));
  const result = await fetchSource("webmotors", criteria, reserve);
  expect(requestBodies).toHaveLength(1);
  expect(result).toMatchObject({
    status: "ok",
    partial: true,
    creditsReserved: 2,
    total: null,
    received: 1,
  });
  expect(result.listings).toHaveLength(1);
  expect(
    result.targets?.map((target) => [
      target.model,
      target.status,
      target.creditsReserved,
    ]),
  ).toEqual([
    ["COROLLA", "ok", 2],
    ["COROLLA SEDAN", "error", 0],
  ]);
  expect(result.message).toContain("1 de 2 consultas");
  expect(result.message).toContain("Orçamento");
});

it("does not spend or call Webmotors when there is no approved outbound model binding", async () => {
  const { fetchSource } = await import("../src/lib/discovery-providers");
  queryFixtureState.noTargets = true;
  const reserve = vi.fn();
  const result = await fetchSource("webmotors", criteria, reserve);
  expect(result).toMatchObject({
    status: "error",
    creditsReserved: 0,
    listings: [],
  });
  expect(result.message).toContain("vínculo de busca validado");
  expect(reserve).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps family coverage partial when a successful target reports more pages", async () => {
  const { fetchSource } = await import("../src/lib/discovery-providers");
  queryFixtureState.extraTarget = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          listings: [reef],
          total_results: 25,
          has_more: true,
        },
      }),
    ),
  );
  const result = await fetchSource("webmotors", criteria, vi.fn());
  expect(result).toMatchObject({
    status: "ok",
    partial: true,
    total: null,
    creditsReserved: 4,
  });
  expect(result.targets?.every((target) => target.partial)).toBe(true);
  expect(result.message).toContain("páginas ainda não recebidas");
});
