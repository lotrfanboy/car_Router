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
let email: typeof import("../src/lib/radar-email");
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
const confirmed = (id: string, patch: Partial<Listing> = {}) =>
  listing(id, {
    identity: { brandId: "b", modelId: "m" },
    catalogResolution: { model: "confirmed", version: "unresolved" },
    reasons: [],
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
  email = await import("../src/lib/radar-email");
}, 30000);
beforeEach(async () => {
  await db.radarEmailDelivery.deleteMany();
  await db.radar.deleteMany();
  await db.savedSearch.deleteMany();
  await db.searchLock.deleteMany();
  state.sources = [];
  state.calls = 0;
  state.afterCollection = undefined;
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "true");
  vi.stubEnv("RADAR_EMAIL_ENABLED", "true");
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
    runsRemaining: 20,
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
  state.sources = [source([confirmed("new")])];
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
  state.sources = [source([confirmed("new")])];
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

it("sends one durable digest for all confirmed new opportunities, excluding uncertain matches", async () => {
  configureEmail();
  const row = await create({ channel: "both" });
  state.sources = [source([confirmed("baseline")])];
  await radar.tickRadars();
  expect(fetch).not.toHaveBeenCalled();
  state.sources = [
    source([
      confirmed("baseline"),
      ...Array.from({ length: 12 }, (_, i) => confirmed(String(i))),
      listing("uncertain"),
    ]),
  ];
  await due(row.id);
  await radar.tickRadars();
  expect(await db.radarNotice.count()).toBe(14);
  expect(await db.radarEmailDelivery.count()).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  const delivery = await db.radarEmailDelivery.findFirstOrThrow();
  expect(delivery).toMatchObject({
    status: "accepted",
    providerId: "offline-message",
    attempts: 1,
  });
  const payload = JSON.parse(delivery.payload!);
  expect(payload.subject).toContain("12 nova(s)");
  expect(payload.text).not.toContain("test-uncertain");
  expect(payload.text).not.toContain("test-baseline");
  expect(payload.text).toContain("/radares#radar-");
  expect(payload.text).toContain("https://pr.olx.com.br/");
  expect(payload).not.toHaveProperty("cc");
  expect(payload).not.toHaveProperty("bcc");
});

it("keeps the original claim token if a radar is edited immediately after the claim", async () => {
  const row = await create({ runsRemaining: 1 });
  state.sources = [source([listing("stale")])];
  const original = db.radar.findUnique.bind(db.radar);
  let edited = false;
  const spy = vi.spyOn(db.radar, "findUnique").mockImplementation((args) => {
    return original(args).then(async (result) => {
      if (!edited && result?.lastRunAt) {
        edited = true;
        return db.radar.update({
          where: { id: row.id },
          data: {
            name: "Edited after claim",
            runsRemaining: 5,
            updatedAt: new Date(result.updatedAt.getTime() + 1000),
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

function configureEmail() {
  vi.stubEnv("RESEND_API_KEY", "offline-only");
  vi.stubEnv("RADAR_EMAIL_FROM", "Radar <radar@example.test>");
  vi.stubEnv("RADAR_EMAIL_TO", "owner@example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) =>
      options?.method === "POST"
        ? Response.json({ id: "offline-message" })
        : Response.json({ id: "offline-message", last_event: "sent" }),
    ),
  );
}
async function newOpportunity() {
  const row = await create({ channel: "both" });
  state.sources = [source([confirmed("base")])];
  await radar.tickRadars();
  state.sources = [source([confirmed("base"), confirmed("new")])];
  await due(row.id);
  await radar.tickRadars();
  return row;
}
it("retries only a rate-limited pending delivery with the same key and frozen content, without another collection", async () => {
  configureEmail();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429 }));
  const row = await newOpportunity();
  const pending = await db.radarEmailDelivery.findFirstOrThrow();
  expect(pending).toMatchObject({ status: "retry", attempts: 1 });
  expect(await db.radarNotice.count()).toBe(2);
  await db.$disconnect();
  await db.radarEmailDelivery.update({
    where: { id: pending.id },
    data: { nextAttemptAt: new Date(0) },
  });
  vi.stubEnv("RADAR_EMAIL_TO", "changed@example.test");
  await radar.tickRadars();
  expect(state.calls).toBe(2);
  expect(
    (await db.radar.findUniqueOrThrow({ where: { id: row.id } })).runsRemaining,
  ).toBe(18);
  expect(await db.radarEmailDelivery.findFirst()).toMatchObject({
    status: "accepted",
    attempts: 2,
    providerId: "offline-message",
    deliveredAt: null,
  });
  const posts = vi
    .mocked(fetch)
    .mock.calls.filter(([, options]) => options?.method === "POST");
  expect(posts).toHaveLength(2);
  expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
  expect(posts[0][1]?.headers).toEqual(posts[1][1]?.headers);
  expect(JSON.parse(String(posts[1][1]?.body)).to).toEqual([
    "owner@example.test",
  ]);
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ id: "offline-message", last_event: "delivered" }),
  );
  await email.reconcileRadarEmails();
  expect(await db.radarEmailDelivery.findFirst()).toMatchObject({
    status: "delivered",
    deliveredAt: expect.any(Date),
  });
});
it.each(["timeout", "server-error", "missing-id"])(
  "quarantines ambiguous %s without a blind retry",
  async (failure) => {
    configureEmail();
    if (failure === "timeout")
      vi.mocked(fetch).mockRejectedValueOnce(new Error("secret diagnostic"));
    else
      vi.mocked(fetch).mockResolvedValueOnce(
        failure === "server-error"
          ? new Response(null, { status: 503 })
          : Response.json({}),
      );
    await newOpportunity();
    expect(await db.radarEmailDelivery.findFirst()).toMatchObject({
      status: "unknown",
      attempts: 1,
      providerId: null,
    });
    await radar.tickRadars();
    await email.deliverPendingRadarEmails(
      (await db.radarEmailDelivery.findFirstOrThrow()).id,
    );
    expect(state.calls).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      (await db.radarEmailDelivery.findFirstOrThrow()).lastError,
    ).not.toContain("secret");
  },
);
it("limits rejected delivery retries to three and never retries outside Resend's key window", async () => {
  configureEmail();
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 429 }));
  await newOpportunity();
  const pending = await db.radarEmailDelivery.findFirstOrThrow();
  for (let attempt = 0; attempt < 4; attempt++) {
    await db.radarEmailDelivery.update({
      where: { id: pending.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await email.deliverPendingRadarEmails();
  }
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(await db.radarEmailDelivery.findFirst()).toMatchObject({
    status: "failed",
    attempts: 3,
  });
  await db.radarEmailDelivery.update({
    where: { id: pending.id },
    data: {
      status: "retry",
      attempts: 1,
      firstAttemptAt: new Date(Date.now() - 24 * 3600000),
    },
  });
  await email.deliverPendingRadarEmails();
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(state.calls).toBe(2);
});
it("never sends routine emails for repeated IDs, known price drops or uncertain matches", async () => {
  configureEmail();
  const row = await create({ channel: "both" });
  state.sources = [source([confirmed("base")])];
  await radar.tickRadars();
  state.sources = [
    source([confirmed("base", { priceCents: 9000000 }), listing("uncertain")]),
  ];
  await due(row.id);
  await radar.tickRadars();
  expect(await db.radarNotice.count({ where: { kind: "price_drop" } })).toBe(1);
  expect(
    await db.radarNotice.count({ where: { matchStatus: "uncertain" } }),
  ).toBe(1);
  expect(await db.radarEmailDelivery.count()).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});
it("preview and confirmation send a clearly labeled test with no listing calls; confirmation is idempotent", async () => {
  configureEmail();
  const preview = await email.previewRadarTestEmail();
  expect(preview).toMatchObject({
    subject: expect.stringContaining("[TESTE MVP]"),
    to: ["owner@example.test"],
  });
  if (!("id" in preview)) throw new Error("Expected a configured preview");
  expect(preview.id).toBeTruthy();
  await email.deliverPendingRadarEmails();
  expect(fetch).not.toHaveBeenCalled();
  const result = await email.confirmRadarTestEmail(preview.id!);
  expect(result).toMatchObject({
    status: "accepted",
    providerId: "offline-message",
  });
  await email.confirmRadarTestEmail(preview.id!);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(state.calls).toBe(0);
  expect(await db.radarRun.count()).toBe(0);
  expect(await db.providerSpend.count()).toBe(0);
});
it("does not use a recipient Gmail as sender or disclose the API key in readiness", () => {
  configureEmail();
  vi.stubEnv("RADAR_EMAIL_FROM", "Owner <owner@gmail.com>");
  expect(email.radarEmailConfiguration().configured).toBe(false);
  expect(JSON.stringify(email.radarEmailConfiguration())).not.toContain(
    "offline-only",
  );
});
it("does not collect a paused or legacy unlimited radar; concurrent ticks claim one bounded execution", async () => {
  const paused = await create({ enabled: false });
  const legacy = await create({ enabled: false, runsRemaining: null });
  await db.radar.update({ where: { id: legacy.id }, data: { enabled: true } });
  state.sources = [source([])];
  expect(await radar.tickRadars()).toEqual({ processed: 0 });
  expect(state.calls).toBe(0);
  expect(
    (await db.radar.findUniqueOrThrow({ where: { id: paused.id } })).enabled,
  ).toBe(false);
  const active = await create({ runsRemaining: 1 });
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.afterCollection = async () => {
    enter();
    await gate;
  };
  const first = radar.tickRadars();
  await entered;
  await expect(radar.tickRadars()).rejects.toMatchObject({ status: 409 });
  release();
  await first;
  await db.$disconnect();
  expect(await radar.tickRadars()).toEqual({ processed: 0 });
  expect(state.calls).toBe(1);
  expect(await db.radar.findUnique({ where: { id: active.id } })).toMatchObject(
    { enabled: false, runsRemaining: 0 },
  );
});
it("recovers a persisted run's pending summary after interruption without collecting again", async () => {
  configureEmail();
  vi.stubEnv("RADAR_EMAIL_ENABLED", "false");
  await newOpportunity();
  const run = await db.radarRun.findFirstOrThrow({
    orderBy: { startedAt: "desc" },
  });
  await db.radarEmailDelivery.deleteMany();
  await db.radarRun.update({
    where: { id: run.id },
    data: {
      status: "running",
      finishedAt: null,
      startedAt: new Date(Date.now() - 31 * 60000),
    },
  });
  vi.stubEnv("RADAR_EMAIL_ENABLED", "true");
  await radar.tickRadars();
  expect(state.calls).toBe(2);
  expect(await db.radarRun.findUnique({ where: { id: run.id } })).toMatchObject(
    { status: "error" },
  );
  expect(await db.radarEmailDelivery.findFirst()).toMatchObject({
    status: "accepted",
    idempotencyKey: `radar-run/${run.id}`,
  });
  expect(fetch).toHaveBeenCalledTimes(2); // one send and one status read, never another collection.
});
it("quarantines an abandoned send and keeps paused pending deliveries until explicit operator retry", async () => {
  configureEmail();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429 }));
  const row = await newOpportunity();
  const pending = await db.radarEmailDelivery.findFirstOrThrow();
  await db.radar.update({ where: { id: row.id }, data: { enabled: false } });
  await db.radarEmailDelivery.update({
    where: { id: pending.id },
    data: { nextAttemptAt: new Date(0) },
  });
  await radar.tickRadars();
  expect(fetch).toHaveBeenCalledTimes(1);
  await email.deliverPendingRadarEmails(pending.id);
  expect(await db.radarEmailDelivery.findFirst()).toMatchObject({
    status: "accepted",
    attempts: 2,
  });
  await db.radarEmailDelivery.update({
    where: { id: pending.id },
    data: { status: "sending", claimedAt: new Date(Date.now() - 6 * 60000) },
  });
  await email.deliverPendingRadarEmails(pending.id);
  expect(await db.radarEmailDelivery.findFirst()).toMatchObject({
    status: "unknown",
    attempts: 2,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(state.calls).toBe(2);
});
