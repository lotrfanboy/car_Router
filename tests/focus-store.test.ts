import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { searchSchema, type Listing } from "../src/lib/discovery";
const state = vi.hoisted(() => ({
  calls: [] as unknown[],
  price: 10000000,
  fail: false,
  configured: true,
}));
vi.mock("../src/lib/discovery-providers", async (original) => {
  const actual =
    await original<typeof import("../src/lib/discovery-providers")>();
  return {
    ...actual,
    providerConfig: () => ({
      configured: state.configured,
      provider: "gecko",
      cost: 1,
      key: "test-only",
    }),
    fetchSource: vi.fn(async (source, criteria, reserve) => {
      state.calls.push(criteria);
      await reserve("gecko", 1);
      const observedAt = new Date().toISOString();
      const listings: Listing[] = Array.from({ length: 7 }, (_, i) => ({
        source: "olx",
        externalId: String(i),
        url: `https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-only-${i}`,
        title: "TESTE ISOLADO Corolla XEi",
        brand: "Toyota",
        model: "Corolla",
        version: "XEi",
        versionOrigin: "explicit",
        modelYear: 2021,
        mileage: 50000 + i * 10,
        city: "Curitiba",
        state: "PR",
        priceCents: i === 0 ? state.price : 13000000,
        sellerType: "private",
        observedAt,
        reasons: [],
      }));
      return {
        source,
        status: state.fail ? "error" : "ok",
        message: state.fail ? "Fornecedor indisponível" : "Uma página de teste",
        observedAt,
        elapsedMs: 1,
        creditsReserved: 1,
        total: state.fail ? null : 7,
        partial: false,
        listings: state.fail ? [] : listings,
      };
    }),
  };
});
const root = mkdtempSync(path.join(process.env.RADAR_TEST_ROOT!, "focus-"));
process.env.DATABASE_URL = "file:" + path.join(root, "test.db");
let db: typeof import("../src/lib/db").db;
let store: typeof import("../src/lib/discovery-store");
let radar: typeof import("../src/lib/radar");
let listings: typeof import("../src/lib/listings-store");
const criteria = searchSchema.parse({
  name: "TESTE ISOLADO",
  brand: "Toyota",
  model: "Corolla",
  city: "Curitiba",
  state: "PR",
  version: "XEi",
  yearMin: 2021,
  yearMax: 2021,
  priceMax: 110000,
  mileageMax: 70000,
  privateOnly: true,
  sources: ["olx"],
  olxUrl: "",
});
const deliveries: unknown[] = [];
beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  db = (await import("../src/lib/db")).db;
  store = await import("../src/lib/discovery-store");
  radar = await import("../src/lib/radar");
  listings = await import("../src/lib/listings-store");
}, 30000);
beforeEach(async () => {
  await db.radar.deleteMany();
  await db.searchRun.deleteMany();
  await db.savedSearch.deleteMany();
  await db.discoveredListing.deleteMany();
  await db.searchCache.deleteMany();
  await db.searchLock.deleteMany();
  await db.providerSpend.deleteMany();
  state.calls.length = 0;
  state.price = 10000000;
  state.fail = false;
  state.configured = true;
  deliveries.length = 0;
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "true");
  vi.stubEnv("RADAR_CRON_SECRET", "test-only-012345678901234567890123456789");
  vi.stubEnv("RESEND_API_KEY", "test-only");
  vi.stubEnv("RADAR_EMAIL_FROM", "radar@example.test");
  vi.stubEnv("RADAR_EMAIL_TO", "owner@example.test");
  vi.stubEnv("RADAR_APP_URL", "https://app.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      deliveries.push(JSON.parse(options.body));
      return Response.json({ id: "test-message" });
    }),
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await db.$disconnect();
});
async function due(id: string) {
  await db.radar.update({ where: { id }, data: { nextRunAt: new Date(0) } });
  await db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
  await db.searchCache.deleteMany();
}
async function createRadar(enabled = true) {
  const search = await store.saveSearch(criteria);
  return radar.saveRadar({
    searchId: search.id,
    name: "TESTE ISOLADO",
    minPercent: 10,
    intervalHours: 24,
    enabled,
  });
}
it("collects uncapped references while applying the original budget to candidates", async () => {
  const search = await store.saveSearch(criteria);
  const run = await store.executeSearch(search.id);
  expect(state.calls[0]).toMatchObject({
    priceMax: null,
    mileageMax: null,
    privateOnly: false,
    yearMin: 2020,
    yearMax: 2022,
  });
  const candidates = run.sources[0].listings.filter((x) => !x.reasons.length);
  expect(candidates).toHaveLength(1);
  expect(candidates[0].comparison).toMatchObject({
    status: "valid",
    count: 6,
    meanCents: 13000000,
    differenceCents: 3000000,
  });
  expect(await db.discoveredListing.count()).toBe(7);
  expect(
    store.referenceCriteria({
      ...criteria,
      olxUrl:
        "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?pe=100000&ps=50000&q=Toyota",
    }).olxUrl,
  ).not.toMatch(/pe=|ps=/);
});
it("deduplicates repeated search creation and reuses a collection across budgets", async () => {
  const [a, b] = await Promise.all([
    store.saveSearch(criteria),
    store.saveSearch({ ...criteria, name: "Another name" }),
  ]);
  expect(a.id).toBe(b.id);
  expect(await db.savedSearch.count()).toBe(1);
  await store.executeSearch(a.id);
  const other = await store.saveSearch({ ...criteria, priceMax: 150000 });
  const run = await store.executeSearch(other.id);
  expect(run).toHaveProperty("cached", true);
  expect(state.calls).toHaveLength(1);
  expect(run.sources[0].listings.filter((x) => !x.reasons.length)).toHaveLength(
    7,
  );
});
it("persists save/un-save idempotently without manufacturing missing vehicle attributes", async () => {
  const search = await store.saveSearch(criteria);
  await store.executeSearch(search.id);
  const route = await import("../src/app/api/listings/[source]/[id]/route");
  const request = () =>
    new Request("http://localhost/api/listings/olx/0", {
      method: "PATCH",
      body: JSON.stringify({ saved: true }),
    });
  const ctx = { params: Promise.resolve({ source: "olx", id: "0" }) };
  const responses = await Promise.all([
    route.PATCH(request(), ctx),
    route.PATCH(request(), ctx),
  ]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  expect(await listings.savedListings()).toHaveLength(1);
  expect(await db.vehicle.count()).toBe(0);
  await db.$disconnect();
  expect((await listings.getListing("olx", "0"))?.saved).toBe(true);
  expect(
    (
      await route.PATCH(
        new Request("http://localhost/api/listings/olx/0", {
          method: "PATCH",
          headers: { origin: "https://other.test" },
          body: '{"saved":false}',
        }),
        ctx,
      )
    ).status,
  ).toBe(403);
});
it("marks missing infrastructure pending and never simulates an active radar", async () => {
  await createRadar();
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "false");
  const result = await radar.listRadars();
  expect(result.radars[0]).toMatchObject({ state: "pending", nextRunAt: null });
  await expect(radar.tickRadars()).rejects.toMatchObject({ status: 409 });
  expect(state.calls).toHaveLength(0);
  expect(deliveries).toHaveLength(0);
});
it("runs server-side, records the real send contract, avoids repeats and notifies on a new qualifying price drop", async () => {
  const row = await createRadar();
  expect((await radar.listRadars()).radars[0].state).toBe("pending");
  expect(await radar.tickRadars()).toEqual({ processed: 1 });
  expect((await radar.listRadars()).radars[0].state).toBe("active");
  expect(state.calls).toHaveLength(1);
  expect(deliveries).toHaveLength(1);
  expect(JSON.stringify(deliveries[0])).toContain("média dos semelhantes");
  expect(JSON.stringify(deliveries[0])).toContain("/anuncios/olx/0");
  expect((await db.radarNotice.findFirst())?.status).toBe("sent");
  await due(row.id);
  await radar.tickRadars();
  expect(deliveries).toHaveLength(1);
  state.price = 9000000;
  await due(row.id);
  await radar.tickRadars();
  expect(deliveries).toHaveLength(2);
  expect(await db.radarRun.count()).toBe(3);
  expect(
    (
      await db.radar.findUnique({ where: { id: row.id } })
    )?.nextRunAt!.getTime(),
  ).toBeGreaterThan(Date.now());
});
it("preserves paused state, logs failed sources, and rejects concurrent ticks and bad authorization", async () => {
  const row = await createRadar(false);
  expect((await radar.listRadars()).radars[0].state).toBe("paused");
  expect(await radar.tickRadars()).toEqual({ processed: 0 });
  expect(state.calls).toHaveLength(0);
  await db.radar.update({ where: { id: row.id }, data: { enabled: true } });
  state.fail = true;
  await radar.tickRadars();
  expect((await radar.listRadars()).radars[0].state).toBe("error");
  expect(deliveries).toHaveLength(0);
  await db.searchLock.create({
    data: { id: "radar-tick", expiresAt: new Date(Date.now() + 60000) },
  });
  await expect(radar.tickRadars()).rejects.toMatchObject({ status: 409 });
  expect(
    radar.authorizedTick(
      new Request("https://app.example.test/api/radars/tick", {
        headers: { authorization: "Bearer wrong" },
      }),
    ),
  ).toBe(false);
});
it("does not claim a notification was sent when provider delivery is uncertain", async () => {
  const row = await createRadar();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("timeout with secret diagnostic");
    }),
  );
  await radar.tickRadars();
  expect((await db.radarNotice.findFirst())?.status).toBe("unconfirmed");
  const run = await db.radarRun.findFirst();
  expect(run?.message).toContain("0 aviso(s)");
  expect(run?.message).not.toContain("secret");
  await due(row.id);
  await radar.tickRadars();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("reuses a pre-upgrade saved search and preserves its history on a failed rerun", async () => {
  const legacy = await db.savedSearch.create({
    data: { name: criteria.name, criteria: JSON.stringify(criteria) },
  });
  await db.searchRun.create({
    data: {
      searchId: legacy.id,
      result: JSON.stringify({ sources: [] }),
      createdAt: new Date(0),
    },
  });
  expect(
    (await store.saveSearch({ ...criteria, name: "new display name" })).id,
  ).toBe(legacy.id);
  state.configured = false;
  await expect(store.executeSearch(legacy.id)).rejects.toMatchObject({
    status: 409,
  });
  expect(await db.searchRun.count({ where: { searchId: legacy.id } })).toBe(1);
});

it("shares a recent manual execution with the Radar without another provider call", async () => {
  const row = await createRadar();
  await store.executeSearch(row.searchId);
  expect(await radar.tickRadars()).toEqual({ processed: 1 });
  expect(state.calls).toHaveLength(1);
  expect(deliveries).toHaveLength(1);
  expect((await db.radarRun.findFirst())?.status).toBe("ok");
});
