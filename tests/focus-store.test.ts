import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  searchSchema,
  type Listing,
  type SourceResult,
} from "../src/lib/discovery";
const state = vi.hoisted(() => ({
  calls: [] as unknown[],
  price: 10000000,
  fail: false,
  configured: true,
  newListing: false,
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
        externalId: state.newListing && i === 0 ? "new-0" : String(i),
        url: `https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-only-${state.newListing && i === 0 ? "new-0" : i}`,
        title: "TESTE ISOLADO Corolla XEi",
        brand: "Toyota",
        model: "Corolla",
        version: "XEi",
        versionOrigin: "explicit",
        ...(criteria.catalog?.provider === "carrouter"
          ? {
              identity: {
                brandId: criteria.catalog.brandCode,
                modelId: criteria.catalog.modelCode,
              },
            }
          : {}),
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
  state.newListing = false;
  deliveries.length = 0;
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "true");
  vi.stubEnv("RADAR_EMAIL_ENABLED", "true");
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
    runsRemaining: 20,
    minPercent: 10,
    intervalHours: 24,
    enabled,
  });
}
it("preserves every collection filter and uses stored observations for comparisons", async () => {
  const search = await store.saveSearch(criteria);
  const run = await store.executeSearch(search.id);
  expect(state.calls[0]).toMatchObject({
    priceMax: 110000,
    mileageMax: 70000,
    privateOnly: true,
    yearMin: 2021,
    yearMax: 2021,
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
  ).toBe("");
  expect(state.calls[0]).not.toHaveProperty("version");
});
it("deduplicates identical searches but does not reuse a narrower collection for another budget", async () => {
  const [a, b] = await Promise.all([
    store.saveSearch(criteria),
    store.saveSearch({ ...criteria, name: "Another name" }),
  ]);
  expect(a.id).toBe(b.id);
  expect(await db.savedSearch.count()).toBe(1);
  await store.executeSearch(a.id);
  const other = await store.saveSearch({ ...criteria, priceMax: 150000 });
  const run = await store.executeSearch(other.id);
  expect("cached" in run && run.cached).not.toBe(true);
  expect(state.calls).toHaveLength(2);
  expect(run.sources[0].listings.filter((x) => !x.reasons.length)).toHaveLength(
    7,
  );
});
it("reconciles legacy FIPE selections into one canonical search without collecting twice", async () => {
  const brandCatalog = {
    provider: "fipe",
    brandCode: "59",
    brandName: "Toyota",
  };
  const modelCatalog = {
    ...brandCatalog,
    modelCode: "123",
    modelName: "Corolla XEi 2.0 Flex 16V Aut.",
  };
  const first = await store.saveSearch({ ...criteria, catalog: brandCatalog });
  const second = await store.saveSearch({ ...criteria, catalog: modelCatalog });
  expect(first.id).toBe(second.id);
  expect(JSON.parse(first.criteria).catalog).toMatchObject({
    provider: "carrouter",
    brandName: "TOYOTA",
    modelName: "COROLLA",
  });
  expect(JSON.parse(second.criteria).catalog).toEqual(
    JSON.parse(first.criteria).catalog,
  );
  const collected = await store.executeSearch(first.id);
  const stored = await db.searchRun.findUniqueOrThrow({
    where: { id: collected.id },
  });
  const storedResult = JSON.parse(stored.result);
  storedResult.sources[0].locationCredits = 1;
  storedResult.sources[0].targets = [
    {
      brand: "TOYOTA",
      model: "COROLLA",
      city: "Curitiba",
      state: "PR",
      status: "ok",
      message: "Recorded target fixture",
      partial: false,
      received: 7,
      total: 7,
      creditsReserved: 1,
      locationCredits: 1,
    },
  ];
  await db.searchRun.update({
    where: { id: collected.id },
    data: { result: JSON.stringify(storedResult) },
  });
  const reused = await store.executeSearch(second.id, { reuseRecent: true });
  expect(reused).toHaveProperty("cached", true);
  expect(state.calls).toHaveLength(1);
  expect(await db.providerSpend.count()).toBe(1);
  expect(reused.sources[0]).toMatchObject({
    creditsReserved: 0,
    locationCredits: 0,
    targets: [{ creditsReserved: 0, locationCredits: 0 }],
    observedAt: collected.sources[0].observedAt,
  });
  const originalRun = await db.searchRun.findUniqueOrThrow({
    where: { id: collected.id },
  });
  expect(JSON.parse(originalRun.result).sources[0].creditsReserved).toBe(1);
  expect(JSON.parse(originalRun.result).sources[0].targets[0]).toMatchObject({
    creditsReserved: 1,
    locationCredits: 1,
  });
  expect(reused.sources[0].listings[0].observedAt).toBe(
    collected.sources[0].listings[0].observedAt,
  );
  expect(await db.discoveredListing.count()).toBe(7);
});

it("recovers an earlier successful page after more than one batch of failed or interrupted attempts", async () => {
  const search = await store.saveSearch(criteria);
  const successful = await store.executeSearch(search.id);
  await db.searchRun.update({
    where: { id: successful.id },
    data: { createdAt: new Date(0) },
  });
  for (let i = 0; i < 22; i++)
    await db.searchRun.create({
      data: {
        searchId: search.id,
        createdAt: new Date(i + 1),
        result:
          i === 10
            ? "unreadable historical record"
            : JSON.stringify({ sources: [], interrupted: true }),
      },
    });
  const failure = await db.searchRun.create({
    data: {
      searchId: search.id,
      result: JSON.stringify({
        sources: [
          {
            ...successful.sources[0],
            status: "error",
            listings: [],
            message: "TESTE ISOLADO · fonte indisponível",
          },
        ],
      }),
    },
  });
  const before = await db.searchRun.findMany({
    where: { searchId: search.id },
    orderBy: { id: "asc" },
  });
  const [row] = await store.listSearches();
  expect(row.latest?.id).toBe(failure.id);
  expect(row.latest?.sources[0].status).toBe("error");
  expect(row.lastSuccessful?.id).toBe(successful.id);
  expect(row.lastSuccessful?.createdAt).toEqual(new Date(0));
  expect(row.lastSuccessful?.sources[0].listings[0].observedAt).toBe(
    successful.sources[0].listings[0].observedAt,
  );
  expect(
    await db.searchRun.findMany({
      where: { searchId: search.id },
      orderBy: { id: "asc" },
    }),
  ).toEqual(before);
});

it("recovers the failed source during partial failure instead of replacing current successful results", async () => {
  const search = await store.saveSearch({
    ...criteria,
    sources: ["olx", "webmotors"],
  });
  const template: SourceResult = {
    source: "olx",
    status: "ok",
    message: "TESTE ISOLADO",
    observedAt: "2026-01-01T00:00:00.000Z",
    elapsedMs: 1,
    creditsReserved: 0,
    total: 0,
    partial: false,
    listings: [],
  };
  const oldListing: Listing = {
    source: "webmotors",
    externalId: "test-previous-wm",
    url: "https://www.webmotors.com.br/comprar/test-previous-wm",
    title: "TESTE ISOLADO · Corolla anterior",
    brand: "Toyota",
    model: "Corolla",
    identity: {
      brandId: JSON.parse(search.criteria).catalog.brandCode,
      modelId: JSON.parse(search.criteria).catalog.modelCode,
    },
    modelYear: 2021,
    priceCents: 10000000,
    mileage: 50000,
    city: "Curitiba",
    state: "PR",
    sellerType: "private",
    observedAt: template.observedAt,
    reasons: [],
  };
  const recovered = await db.searchRun.create({
    data: {
      searchId: search.id,
      createdAt: new Date(0),
      result: JSON.stringify({
        sources: [
          template,
          {
            ...template,
            source: "webmotors",
            total: 1,
            listings: [oldListing],
          },
        ],
      }),
    },
  });
  // The immediately preceding run succeeds only in OLX, so it cannot recover
  // Webmotors. It must remain in history without blocking the older result.
  await db.searchRun.create({
    data: {
      searchId: search.id,
      createdAt: new Date(1),
      result: JSON.stringify({ sources: [template] }),
    },
  });
  const partial = await db.searchRun.create({
    data: {
      searchId: search.id,
      createdAt: new Date(2),
      result: JSON.stringify({
        sources: [
          { ...template, observedAt: "2026-01-02T00:00:00.000Z" },
          { ...template, source: "webmotors", status: "unconfigured" },
        ],
      }),
    },
  });
  const [row] = await store.listSearches();
  expect(row.latest?.id).toBe(partial.id);
  expect(row.latest?.sources.map((source) => source.status)).toEqual([
    "ok",
    "unconfigured",
  ]);
  expect(row.latest?.sources[0].observedAt).toBe("2026-01-02T00:00:00.000Z");
  expect(row.lastSuccessful?.id).toBe(recovered.id);
  expect(row.lastSuccessful?.sources[1]).toMatchObject({
    source: "webmotors",
    status: "ok",
    observedAt: "2026-01-01T00:00:00.000Z",
    listings: [oldListing],
  });
  expect(row.previousSourceRuns).toHaveLength(1);
  expect(row.previousSourceRuns[0].id).toBe(recovered.id);
  expect(
    row.previousSourceRuns[0].sources.map((source) => source.source),
  ).toEqual(["webmotors"]);
  expect(await db.searchRun.count({ where: { searchId: search.id } })).toBe(3);
  expect(state.calls).toHaveLength(0);
});

it("recovers each source independently when partial failure is followed by total failure", async () => {
  const search = await store.saveSearch({
    ...criteria,
    sources: ["olx", "webmotors"],
  });
  const sourceResult = (
    source: SourceResult["source"],
    status: SourceResult["status"],
    observedAt: string,
  ): SourceResult => ({
    source,
    status,
    observedAt,
    message: "TESTE ISOLADO · recuperação por fonte",
    elapsedMs: 1,
    creditsReserved: 0,
    total: status === "ok" ? 1 : null,
    partial: false,
    listings:
      status === "ok"
        ? [
            {
              source,
              externalId: `test-${source}`,
              url:
                source === "olx"
                  ? "https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-only"
                  : "https://www.webmotors.com.br/comprar/test-only",
              title: "TESTE ISOLADO · Corolla",
              brand: "Toyota",
              model: "Corolla",
              modelYear: 2021,
              mileage: 50000,
              priceCents: 10000000,
              city: "Curitiba",
              state: "PR",
              sellerType: "private",
              observedAt,
              reasons: [],
            },
          ]
        : [],
  });
  const dates = [
    "2026-01-01T00:00:00.000Z",
    "2026-01-02T00:00:00.000Z",
    "2026-01-03T00:00:00.000Z",
  ];
  const runs = [];
  for (let index = 0; index < dates.length; index++)
    runs.push(
      await db.searchRun.create({
        data: {
          searchId: search.id,
          createdAt: new Date(dates[index]),
          result: JSON.stringify({
            sources: [
              sourceResult("olx", index < 2 ? "ok" : "error", dates[index]),
              sourceResult(
                "webmotors",
                index === 0 ? "ok" : "error",
                dates[index],
              ),
            ],
          }),
        },
      }),
    );
  const [row] = await store.listSearches();
  expect(row.latest?.id).toBe(runs[2].id);
  expect(row.latest?.sources.map((source) => source.status)).toEqual([
    "error",
    "error",
  ]);
  expect(row.lastSuccessful?.id).toBe(runs[1].id);
  expect(
    row.previousSourceRuns.map((run) => ({
      id: run.id,
      sources: run.sources.map((source) => source.source),
    })),
  ).toEqual([
    { id: runs[1].id, sources: ["olx"] },
    { id: runs[0].id, sources: ["webmotors"] },
  ]);
  for (const [index, run] of row.previousSourceRuns.entries()) {
    const originalDate = dates[1 - index];
    expect(run.createdAt).toEqual(new Date(originalDate));
    expect(run.sources[0].observedAt).toBe(originalDate);
    expect(run.sources[0].listings[0].observedAt).toBe(originalDate);
  }
  expect(
    await db.searchRun.findMany({
      where: { searchId: search.id },
      orderBy: { createdAt: "asc" },
    }),
  ).toEqual(runs);
  expect(state.calls).toHaveLength(0);
});

it("returns no recovery for an interrupted first attempt or an empty successful page", async () => {
  const search = await store.saveSearch(criteria);
  await db.searchRun.create({
    data: {
      searchId: search.id,
      createdAt: new Date(0),
      result: JSON.stringify({ sources: [], interrupted: true }),
    },
  });
  expect((await store.listSearches())[0].lastSuccessful).toBeNull();
  await db.searchRun.create({
    data: {
      searchId: search.id,
      result: JSON.stringify({
        sources: [
          {
            source: "olx",
            status: "ok",
            message: "TESTE ISOLADO · nenhum anúncio recebido",
            observedAt: new Date().toISOString(),
            elapsedMs: 1,
            creditsReserved: 0,
            total: 0,
            partial: true,
            listings: [],
          },
        ],
      }),
    },
  });
  const [row] = await store.listSearches();
  expect(row.latest?.sources[0].status).toBe("ok");
  expect(row.lastSuccessful).toBeNull();
  expect(row.previousSourceRuns).toEqual([]);
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
it("records scheduler health without spending credits when email is unavailable", async () => {
  const row = await createRadar();
  vi.stubEnv("RESEND_API_KEY", "");
  expect(await radar.tickRadars()).toEqual({
    processed: 0,
    skipped: "email-unavailable",
  });
  expect(state.calls).toHaveLength(0);
  expect(deliveries).toHaveLength(0);
  expect(await db.providerSpend.count()).toBe(0);
  expect(
    (await db.radar.findUnique({ where: { id: row.id } }))?.lastRunAt,
  ).toBeNull();
  expect(
    (
      await db.searchLock.findUnique({ where: { id: "radar-heartbeat" } })
    )?.expiresAt.getTime(),
  ).toBeGreaterThan(Date.now());
  expect((await radar.listRadars()).radars[0]).toMatchObject({
    state: "pending",
    nextRunAt: null,
    missing: expect.arrayContaining([expect.stringContaining("e-mail")]),
  });
});
it("establishes the discount baseline and sends a summary only for a new qualifying ID", async () => {
  const row = await createRadar();
  expect((await radar.listRadars()).radars[0].state).toBe("pending");
  expect(await radar.tickRadars()).toEqual({ processed: 1 });
  expect((await radar.listRadars()).radars[0].state).toBe("success");
  expect(state.calls).toHaveLength(1);
  expect(deliveries).toHaveLength(0);
  expect((await db.radarNotice.findFirst())?.kind).toBe("baseline");
  await due(row.id);
  await radar.tickRadars();
  expect(deliveries).toHaveLength(0);
  state.price = 9000000;
  state.newListing = true;
  await due(row.id);
  await radar.tickRadars();
  expect(deliveries).toHaveLength(1);
  expect(JSON.stringify(deliveries[0])).toContain("nova(s) oportunidade(s)");
  expect(JSON.stringify(deliveries[0])).toContain("/radares#radar-");
  expect(await db.radarEmailDelivery.findFirst()).toMatchObject({
    status: "accepted",
    providerId: "test-message",
  });
  expect(await db.radarRun.count()).toBe(3);
  expect(
    (
      await db.radar.findUniqueOrThrow({ where: { id: row.id } })
    ).nextRunAt!.getTime(),
  ).toBeGreaterThan(Date.now());
});
it("reports scheduled and running from persisted scheduler and execution records", async () => {
  const row = await createRadar();
  await db.searchLock.create({
    data: { id: "radar-heartbeat", expiresAt: new Date(Date.now() + 3600000) },
  });
  expect((await radar.listRadars()).radars[0]).toMatchObject({
    state: "scheduled",
    nextRunAt: expect.any(Date),
  });
  const run = await db.radarRun.create({
    data: {
      radarId: row.id,
      status: "running",
      message: "Consultando fontes.",
    },
  });
  expect((await radar.listRadars()).radars[0].state).toBe("running");
  await db.radarRun.update({
    where: { id: run.id },
    data: {
      status: "ok",
      finishedAt: new Date(),
      message: "Consulta concluída.",
    },
  });
  await db.$disconnect();
  expect((await radar.listRadars()).radars[0].state).toBe("success");
  await db.searchLock.update({
    where: { id: "radar-heartbeat" },
    data: { expiresAt: new Date(0) },
  });
  expect((await radar.listRadars()).radars[0]).toMatchObject({
    state: "pending",
    nextRunAt: null,
  });
  expect(state.calls).toHaveLength(0);
  expect(deliveries).toHaveLength(0);
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
  await radar.tickRadars(); // first successful collection establishes the base, without email
  state.newListing = true;
  await due(row.id);
  await radar.tickRadars();
  expect((await db.radarEmailDelivery.findFirst())?.status).toBe("unknown");
  const run = await db.radarRun.findFirst({ orderBy: { startedAt: "desc" } });
  expect(run?.message).not.toContain("secret");
  await due(row.id);
  await radar.tickRadars();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("reuses a pre-upgrade saved search and preserves its history on a failed rerun", async () => {
  const legacy = await db.savedSearch.create({
    data: {
      name: criteria.name,
      criteria: JSON.stringify({
        ...criteria,
        cities: undefined,
        locationMode: undefined,
      }),
    },
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
  expect(deliveries).toHaveLength(0);
  expect((await db.radarNotice.findFirst())?.kind).toBe("baseline");
  expect((await db.radarRun.findFirst())?.status).toBe("ok");
});
