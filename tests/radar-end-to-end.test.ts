import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import fixture from "./fixtures/olx-local-radars.json";
import {
  searchSchema,
  listingMatchStatus,
  type Listing,
} from "../src/lib/discovery";
const state = vi.hoisted(() => ({
  round: 0,
  collections: 0,
  postOutcome: "accepted",
  deliveryEvent: "delivered",
}));
vi.mock("../src/lib/discovery-providers", async (original) => ({
  ...(await original<typeof import("../src/lib/discovery-providers")>()),
  providerConfig: () => ({ configured: true, provider: "gecko", cost: 1 }),
  fetchSource: vi.fn(async (source: string, criteria: { name: string }) => {
    const { readVehicleCatalog } = await import("../src/lib/catalog-store");
    const { commercialListing } = await import("../src/lib/commercial-models");
    const catalog = await readVehicleCatalog();
    const group = fixture.groups.find((g) => g.name === criteria.name)!;
    const listings = structuredClone(group.listings) as Listing[];
    if (state.round > 0) {
      const parsed = searchSchema.parse(group.criteria);
      const confirmed = listings.find(
        (l) =>
          listingMatchStatus(commercialListing(catalog, l), parsed) ===
          "confirmed",
      )!;
      const added = {
        ...structuredClone(confirmed),
        externalId: `OFFLINE-NEW-${group.criteria.state}`,
        title: `OFFLINE NEW ${group.criteria.state}`,
        url: `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/offline-new-${group.criteria.state}`,
      };
      confirmed.priceCents = Math.round(confirmed.priceCents! * 0.95);
      listings.push(added);
      const uncertain = listings.find(
        (l) =>
          listingMatchStatus(commercialListing(catalog, l), parsed) ===
          "uncertain",
      );
      if (uncertain)
        listings.push({
          ...structuredClone(uncertain),
          externalId: `OFFLINE-UNCERTAIN-${group.criteria.state}`,
          title: "OFFLINE UNCERTAIN",
        });
    }
    state.collections++;
    return {
      source,
      status: "ok",
      message: "Offline integration simulation",
      observedAt: new Date().toISOString(),
      elapsedMs: 0,
      creditsReserved: 0,
      total: listings.length,
      partial: true,
      listings: listings.map((l) => commercialListing(catalog, l)),
    };
  }),
}));
const execute = promisify(execFile);
const directory = mkdtempSync(
  path.join(process.env.RADAR_TEST_ROOT!, "radar-e2e-"),
);
process.env.DATABASE_URL =
  "file:" + path.join(directory, "test.db").replaceAll("\\", "/");
let db: typeof import("../src/lib/db").db;
let server: Server;
let appUrl: string;
const messages: {
  id: string;
  text: string;
  to: string[];
  key: string | null;
}[] = [];
beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  db = (await import("../src/lib/db")).db;
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "true");
  vi.stubEnv("RADAR_EMAIL_ENABLED", "true");
  vi.stubEnv(
    "RADAR_CRON_SECRET",
    "offline-e2e-only-000000000000000000000000000",
  );
  vi.stubEnv("RESEND_API_KEY", "offline-only");
  vi.stubEnv("RADAR_EMAIL_FROM", "radar@example.test");
  vi.stubEnv("RADAR_EMAIL_TO", "owner@example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url === "https://api.resend.com/emails" &&
        options?.method === "POST"
      ) {
        const payload = JSON.parse(options.body as string);
        const id = `offline-message-${messages.length + 1}`;
        messages.push({
          id,
          text: payload.text,
          to: payload.to,
          key: new Headers(options.headers).get("Idempotency-Key"),
        });
        if (state.postOutcome === "uncertain")
          return new Response(null, { status: 500 });
        return Response.json({ id });
      }
      const id = url.startsWith("https://api.resend.com/emails/")
        ? url.split("/").at(-1)
        : undefined;
      if (id && messages.some((m) => m.id === id))
        return Response.json({ id, last_event: state.deliveryEvent });
      throw Error("Unexpected network: only mocked delivery is permitted");
    }),
  );
  const { POST } = await import("../src/app/api/radars/tick/route");
  server = createServer(async (request, response) => {
    try {
      const result = await POST(
        new Request(appUrl + request.url, {
          method: request.method,
          headers: { authorization: request.headers.authorization ?? "" },
        }),
      );
      response.writeHead(result.status, { "Content-Type": "application/json" });
      response.end(await result.text());
    } catch {
      response.writeHead(500);
      response.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Local server absent");
  appUrl = `http://127.0.0.1:${address.port}`;
  vi.stubEnv("RADAR_APP_URL", appUrl);
}, 30000);
afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await db?.$disconnect();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function tick() {
  return execute(process.execPath, [path.resolve("scripts/radar-tick.mjs")], {
    cwd: directory,
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: path.join(directory, "absent.env"),
    },
  });
}
async function makeDue() {
  await db.radar.updateMany({
    where: { enabled: true },
    data: { nextRunAt: new Date(0) },
  });
  await db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
  await db.searchCache.deleteMany();
}
it("runs CLI → authenticated HTTP → three radars → local persistence → new-opportunity digests → delivery → bounded pause", async () => {
  const { saveSearch } = await import("../src/lib/discovery-store");
  const { saveRadar } = await import("../src/lib/radar");
  for (const group of fixture.groups) {
    const search = await saveSearch(searchSchema.parse(group.criteria));
    await saveRadar({
      searchId: search.id,
      name: group.name,
      minPercent: 10,
      intervalHours: 24,
      enabled: true,
      runsRemaining: 3,
      channel: "both",
      mode: "new_listings",
    });
  }
  expect((await tick()).stdout).toContain("HTTP 200");
  expect(state.collections).toBe(3);
  expect(messages).toHaveLength(0);
  expect(await db.radarNotice.count({ where: { kind: "baseline" } })).toBe(75);
  state.round = 1;
  await makeDue();
  expect((await tick()).stdout).toContain("HTTP 200");
  expect(state.collections).toBe(6);
  expect(messages).toHaveLength(3);
  expect(
    await db.radarNotice.count({
      where: { kind: "new_listing", emailEligible: true },
    }),
  ).toBe(3);
  expect(
    await db.radarNotice.count({
      where: { kind: "price_drop", emailEligible: false },
    }),
  ).toBe(3);
  expect(
    await db.radarNotice.count({
      where: { matchStatus: "uncertain", emailEligible: true },
    }),
  ).toBe(0);
  for (const message of messages) {
    expect(message.to).toEqual(["owner@example.test"]);
    expect(message.text).toContain("OFFLINE NEW");
    expect(message.text).not.toContain("OFFLINE UNCERTAIN");
    expect(message.text).toContain(`${appUrl}/radares/`);
    expect(message.key).toMatch(/^radar-run\//);
  }
  expect(
    await db.radarEmailDelivery.count({ where: { status: "accepted" } }),
  ).toBe(3);
  await makeDue();
  expect((await tick()).stdout).toContain("HTTP 200");
  expect(
    await db.radarEmailDelivery.count({
      where: { status: "delivered", attempts: 1 },
    }),
  ).toBe(3);
  expect(
    await db.radar.count({
      where: { enabled: false, runsRemaining: 0, nextRunAt: null },
    }),
  ).toBe(3);
  expect((await tick()).stdout).toContain("HTTP 200");
  expect(state.collections).toBe(9);
  expect(messages).toHaveLength(3);
  expect(await db.radarRun.count({ where: { status: "ok" } })).toBe(9);
  expect(await db.providerSpend.count()).toBe(0);
  expect(await db.discoveredListing.count()).toBe(154);
  expect(await db.searchLock.count({ where: { id: "radar-tick" } })).toBe(0);
}, 60000);

async function singleAudi(mode: "accepted" | "uncertain") {
  const group = fixture.groups[1];
  state.round = 0;
  state.postOutcome = mode;
  state.deliveryEvent = "sent";
  const { saveSearch } = await import("../src/lib/discovery-store");
  const { saveRadar } = await import("../src/lib/radar");
  const search = await saveSearch(searchSchema.parse(group.criteria));
  const radar = await saveRadar({
    searchId: search.id,
    name: "OFFLINE Audi owner digest",
    minPercent: 10,
    intervalHours: 24,
    enabled: true,
    runsRemaining: 2,
    channel: "both",
    mode: "new_listings",
  });
  const messagesBefore = messages.length;
  await makeDue();
  await tick();
  expect(messages).toHaveLength(messagesBefore);
  state.round = 1;
  await makeDue();
  await tick();
  const delivery = await db.radarEmailDelivery.findFirstOrThrow({
    where: { radarId: radar.id },
  });
  expect(await db.radar.findUnique({ where: { id: radar.id } })).toMatchObject({
    enabled: false,
    runsRemaining: 0,
    nextRunAt: null,
  });
  expect(messages).toHaveLength(messagesBefore + 1);
  expect(delivery).toMatchObject({
    kind: "digest",
    attempts: 1,
    deliveredAt: null,
  });
  expect(messages.at(-1)?.to).toEqual(["owner@example.test"]);
  expect(messages.at(-1)?.text).toContain("OFFLINE NEW PR");
  return { radar, delivery, messagesBefore };
}
it("keeps an ambiguous automatic digest quarantined after a bounded cycle, without resending or collecting again", async () => {
  const { delivery, messagesBefore } = await singleAudi("uncertain");
  expect(delivery.status).toBe("unknown");
  expect(delivery.providerId).toBeNull();
  const collectionsBefore = state.collections;
  const { deliverPendingRadarEmails, reconcileRadarEmails } =
    await import("../src/lib/radar-email");
  await deliverPendingRadarEmails(delivery.id);
  await reconcileRadarEmails(delivery.id);
  await tick();
  expect(messages).toHaveLength(messagesBefore + 1);
  expect(state.collections).toBe(collectionsBefore);
  expect(
    await db.radarEmailDelivery.findUnique({ where: { id: delivery.id } }),
  ).toMatchObject({ status: "unknown", attempts: 1, deliveredAt: null });
  expect(await db.providerSpend.count()).toBe(0);
}, 60000);
it("distinguishes accepted from delivered and confirms a paused radar digest with status-only reads", async () => {
  const { delivery, messagesBefore } = await singleAudi("accepted");
  expect(delivery.status).toBe("accepted");
  const collectionsBefore = state.collections;
  const { reconcileRadarEmails } = await import("../src/lib/radar-email");
  await reconcileRadarEmails(delivery.id);
  expect(
    await db.radarEmailDelivery.findUnique({ where: { id: delivery.id } }),
  ).toMatchObject({ status: "accepted", deliveredAt: null });
  state.deliveryEvent = "delivered";
  await reconcileRadarEmails(delivery.id);
  await tick();
  const done = await db.radarEmailDelivery.findUniqueOrThrow({
    where: { id: delivery.id },
  });
  expect(done).toMatchObject({ status: "delivered", attempts: 1 });
  expect(done.deliveredAt).not.toBeNull();
  expect(messages).toHaveLength(messagesBefore + 1);
  expect(state.collections).toBe(collectionsBefore);
  expect(await db.providerSpend.count()).toBe(0);
}, 60000);
