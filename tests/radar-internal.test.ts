import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  searchSchema,
  type Listing,
  type SourceResult,
} from "../src/lib/discovery";
const state = vi.hoisted(() => ({
  sources: [] as SourceResult[],
  calls: 0,
  afterCollection: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("../src/lib/discovery-store", async (original) => ({
  ...(await original<typeof import("../src/lib/discovery-store")>()),
  executeSearch: vi.fn(async () => {
    state.calls++;
    await state.afterCollection?.();
    return { sources: state.sources };
  }),
}));
vi.mock("../src/lib/discovery-providers", async (original) => ({
  ...(await original<typeof import("../src/lib/discovery-providers")>()),
  providerConfig: () => ({ configured: true }),
}));
const directory = mkdtempSync(
  path.join(process.env.RADAR_TEST_ROOT!, "radar-internal-"),
);
process.env.DATABASE_URL = "file:" + path.join(directory, "test.db");
let db: typeof import("../src/lib/db").db;
let radar: typeof import("../src/lib/radar");
const criteria = searchSchema.parse({
  name: "Offline radar",
  brand: "Fixture brand",
  model: "Fixture model",
  state: "PR",
  yearMin: 2016,
  yearMax: null,
  priceMax: null,
  mileageMax: null,
  privateOnly: false,
  sources: ["olx", "webmotors"],
  catalog: {
    provider: "carrouter",
    revision: "offline",
    brandCode: "b",
    brandName: "Fixture brand",
    modelCode: "m",
    modelName: "Fixture model",
  },
});
const listing = (id: string, patch: Partial<Listing> = {}): Listing => ({
  source: "olx",
  externalId: id,
  url: `https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-${id}`,
  title: "Fixture listing",
  brand: criteria.brand,
  model: criteria.model,
  modelYear: 2020,
  priceCents: 10000000,
  mileage: 50000,
  city: "Curitiba",
  state: "PR",
  sellerType: "private",
  observedAt: new Date().toISOString(),
  reasons: ["Modelo não classificado"],
  catalogResolution: { model: "unresolved", version: "unresolved" },
  ...patch,
});
const source = (
  rows: Listing[],
  status: SourceResult["status"] = "ok",
  name: SourceResult["source"] = "olx",
): SourceResult => ({
  source: name,
  status,
  listings: rows,
  message: "Offline replay",
  observedAt: new Date().toISOString(),
  elapsedMs: 1,
  creditsReserved: 0,
  total: rows.length,
  partial: false,
});
beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  db = (await import("../src/lib/db")).db;
  radar = await import("../src/lib/radar");
}, 30000);
beforeEach(async () => {
  await db.radar.deleteMany();
  await db.savedSearch.deleteMany();
  await db.searchLock.deleteMany();
  state.sources = [];
  state.calls = 0;
  state.afterCollection = undefined;
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "true");
  vi.stubEnv("RADAR_CRON_SECRET", "offline-only-secret-012345678901234567890");
  vi.stubEnv("RADAR_APP_URL", "https://app.example.test");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RADAR_EMAIL_TO", "");
  vi.stubEnv("RADAR_EMAIL_FROM", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No network allowed in internal radar tests");
    }),
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await db.$disconnect();
});
async function create(options: Record<string, unknown> = {}) {
  const search = await db.savedSearch.create({
    data: { name: criteria.name, criteria: JSON.stringify(criteria) },
  });
  return radar.saveRadar({
    searchId: search.id,
    name: "Internal fixture",
    mode: "new_listings",
    channel: "in_app",
    minPercent: 10,
    intervalHours: 24,
    enabled: true,
    ...options,
  });
}
async function due(id: string) {
  await db.radar.update({ where: { id }, data: { nextRunAt: new Date(0) } });
}

it("records first observations, then only new-for-radar IDs and >=1% price drops without email", async () => {
  const row = await create();
  state.sources = [source([listing("one")])];
  expect(await radar.tickRadars()).toEqual({ processed: 1 });
  expect(await db.radarNotice.findFirst()).toMatchObject({
    kind: "baseline",
    status: "recorded",
    matchStatus: "uncertain",
  });
  expect((await radar.listRadars()).radars[0]).toMatchObject({
    state: "success",
    missing: [],
    notices: [{ listing: { externalId: "one" } }],
  });
  await due(row.id);
  await radar.tickRadars();
  expect(await db.radarNotice.count()).toBe(1);
  state.sources = [
    source([
      listing("one"),
      listing("two", {
        identity: { brandId: "b", modelId: "m" },
        catalogResolution: { model: "confirmed", version: "unresolved" },
        reasons: [],
      }),
    ]),
  ];
  await due(row.id);
  await radar.tickRadars();
  expect(
    await db.radarNotice.findFirst({ where: { listingKey: "olx:two" } }),
  ).toMatchObject({ kind: "new_listing", matchStatus: "confirmed" });
  state.sources = [
    source([listing("one", { priceCents: 9900000 }), listing("two")]),
  ];
  await due(row.id);
  await radar.tickRadars();
  expect(
    await db.radarNotice.findFirst({ where: { kind: "price_drop" } }),
  ).toMatchObject({ priceCents: 9900000, previousPriceCents: 10000000 });
  await db.$disconnect();
  await due(row.id);
  await radar.tickRadars();
  expect(await db.radarNotice.count()).toBe(3);
  expect(fetch).not.toHaveBeenCalled();
});

it("initializes sources independently and treats successful empty first pages as baseline", async () => {
  const row = await create();
  state.sources = [source([]), source([], "error", "webmotors")];
  await radar.tickRadars();
  expect(await db.radarSourceState.count()).toBe(1);
  state.sources = [
    source([listing("later")]),
    source([listing("first-wm", { source: "webmotors" })], "ok", "webmotors"),
  ];
  await due(row.id);
  await radar.tickRadars();
  expect(
    await db.radarNotice.findFirst({ where: { listingKey: "olx:later" } }),
  ).toMatchObject({ kind: "new_listing" });
  expect(
    await db.radarNotice.findFirst({
      where: { listingKey: "webmotors:first-wm" },
    }),
  ).toMatchObject({ kind: "baseline" });
  expect(await db.radarSourceState.count()).toBe(2);
});

it("retains uncertainty, excludes incompatible and missing-price records without inventing prices", async () => {
  await create();
  state.sources = [
    source([
      listing("uncertain"),
      listing("wrong-year", { modelYear: 2015 }),
      listing("no-price", { priceCents: null }),
    ]),
  ];
  await radar.tickRadars();
  expect(await db.radarNotice.count()).toBe(1);
  expect(await db.radarObservation.count()).toBe(3);
  expect((await db.radarRun.findFirst())?.message).toContain(
    "1 incompatível(is); 1 sem preço válido",
  );
});

it.each([false, true])(
  "consumes one bounded attempted run and pauses after preserving its events (source failure=%s)",
  async (failure) => {
    const row = await create({ runsRemaining: 1 });
    state.sources = [
      source(failure ? [] : [listing("first")], failure ? "error" : "ok"),
    ];
    await radar.tickRadars();
    expect(await db.radar.findUnique({ where: { id: row.id } })).toMatchObject({
      enabled: false,
      runsRemaining: 0,
      nextRunAt: null,
    });
    expect(await db.radarNotice.count()).toBe(failure ? 0 : 1);
    expect(await radar.tickRadars()).toEqual({ processed: 0 });
    expect(state.calls).toBe(1);
  },
);

it("preserves internal notifications when both channels requested but email is unavailable", async () => {
  const row = await create({ channel: "both" });
  state.sources = [source([])];
  await radar.tickRadars();
  state.sources = [source([listing("new")])];
  await due(row.id);
  await radar.tickRadars();
  expect(await db.radarNotice.findFirst()).toMatchObject({
    kind: "new_listing",
    status: "email_unavailable",
    channel: "both",
  });
  expect(fetch).not.toHaveBeenCalled();
});

it("does not record or send stale criteria after a pause during collection", async () => {
  const row = await create();
  state.sources = [source([listing("new")])];
  state.afterCollection = async () => {
    await db.radar.update({ where: { id: row.id }, data: { enabled: false } });
  };
  await radar.tickRadars();
  expect(await db.radarNotice.count()).toBe(0);
  expect(await db.radarSourceState.count()).toBe(0);
  expect((await db.radarRun.findFirst())?.message).toContain("pausado");
});

it("does not claim old rows were newly advertised when another radar already saw them", async () => {
  state.sources = [source([listing("shared")])];
  await create();
  await radar.tickRadars();
  await create();
  await radar.tickRadars();
  expect(await db.radarNotice.count({ where: { kind: "baseline" } })).toBe(2);
  expect(await db.radarNotice.count({ where: { kind: "new_listing" } })).toBe(
    0,
  );
});

it("records the email delivery bound explicitly without losing internal notices", async () => {
  vi.stubEnv("RESEND_API_KEY", "offline-only");
  vi.stubEnv("RADAR_EMAIL_FROM", "radar@example.test");
  vi.stubEnv("RADAR_EMAIL_TO", "owner@example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ id: "offline-message" })),
  );
  const row = await create({ channel: "both" });
  state.sources = [source([])];
  await radar.tickRadars();
  state.sources = [
    source(Array.from({ length: 12 }, (_, i) => listing(String(i)))),
  ];
  await due(row.id);
  await radar.tickRadars();
  expect(await db.radarNotice.count()).toBe(12);
  expect(
    await db.radarNotice.count({ where: { status: "email_limited" } }),
  ).toBe(2);
  expect(fetch).toHaveBeenCalledTimes(10);
  expect(
    (await db.radarRun.findFirst({ orderBy: { startedAt: "desc" } }))?.message,
  ).toContain("limite de 10 e-mails");
});

it("keeps the original claim token if a radar is edited immediately after the claim", async () => {
  const row = await create({ runsRemaining: 1 });
  state.sources = [source([listing("stale")])];
  const original = db.radar.updateMany.bind(db.radar);
  let edited = false;
  const spy = vi.spyOn(db.radar, "updateMany").mockImplementation((args) => {
    return original(args).then(async (result) => {
      if (!edited && args?.data.lastRunAt) {
        edited = true;
        const claimedAt = args.data.updatedAt as Date;
        await db.radar.update({
          where: { id: row.id },
          data: {
            name: "Edited after claim",
            runsRemaining: 5,
            updatedAt: new Date(claimedAt.getTime() + 1000),
          },
        });
      }
      return result;
    }) as ReturnType<typeof original>;
  });
  try {
    expect(await radar.tickRadars()).toEqual({ processed: 1 });
    expect(state.calls).toBe(0);
    expect(await db.radarNotice.count()).toBe(0);
    expect(await db.radar.findUnique({ where: { id: row.id } })).toMatchObject({
      enabled: true,
      runsRemaining: 5,
      name: "Edited after claim",
    });
    expect((await db.radarRun.findFirst())?.message).toContain("alterado");
  } finally {
    spy.mockRestore();
  }
});

it("skips blocked email radars without starving internal channels and retains the three-run bound", async () => {
  for (let i = 0; i < 3; i++) {
    const blocked = await create({ channel: "email" });
    await db.radar.update({
      where: { id: blocked.id },
      data: { nextRunAt: new Date(i) },
    });
  }
  for (let i = 0; i < 4; i++) {
    const internal = await create({ runsRemaining: 1 });
    await db.radar.update({
      where: { id: internal.id },
      data: { nextRunAt: new Date(i + 1000) },
    });
  }
  state.sources = [source([])];
  expect(await radar.tickRadars()).toEqual({ processed: 3 });
  expect(state.calls).toBe(3);
  expect(
    await db.radar.count({ where: { channel: "email", lastRunAt: null } }),
  ).toBe(3);
  expect(
    await db.radar.count({
      where: { channel: "in_app", enabled: false, runsRemaining: 0 },
    }),
  ).toBe(3);
  expect(await radar.tickRadars()).toEqual({ processed: 1 });
  expect(state.calls).toBe(4);
});
