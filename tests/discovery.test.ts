import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  eligibility,
  searchSchema,
  publicListingUrl,
} from "../src/lib/discovery";
import { normalizeOlx, normalizeReef } from "../src/lib/discovery-providers";

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
  url: "https://pr.olx.com.br/regiao-de-curitiba-e-paranagua/autos-e-pecas/carros-vans-e-utilitarios/corolla-123",
  price,
  professionalAd: false,
  location: { city: "Curitiba", state: "PR" },
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
  await db.db.searchRun.deleteMany();
  await db.db.savedSearch.deleteMany();
  await db.db.discoveredListing.deleteMany();
  await db.db.providerSpend.deleteMany();
  await db.db.searchLock.deleteMany();
  calls.length = 0;
  currentPrice = 108000;
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
    listings: [{ isNew: true, priceCents: 10800000 }],
  });
  expect(first.sources[1].listings[0].reasons).toEqual([]);
  await expect(store.executeSearch(search.id)).rejects.toMatchObject({
    status: 429,
  });
  await db.db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
  await store.executeSearch(search.id);
  expect(await db.db.listingPrice.count()).toBe(2);
  await db.db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
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
    (await store.listSearches())[0].latest.sources[0].listings[0].priceCents,
  ).toBe(10300000);
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
  expect((await store.executeSearch(search.id)).sources[0].status).toBe(
    "unconfigured",
  );
  expect(calls).toHaveLength(0);
  await db.db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
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
