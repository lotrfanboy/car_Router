import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fixture from "./fixtures/olx-local-radars.json";
import { searchSchema, type Listing } from "../src/lib/discovery";
const state = vi.hoisted(() => ({ listings: [] as Listing[] }));
vi.mock("../src/lib/discovery-providers", async (original) => ({
  ...(await original<typeof import("../src/lib/discovery-providers")>()),
  providerConfig: () => ({ configured: true, provider: "gecko", cost: 1 }),
  fetchSource: vi.fn(async (source: string) => {
    const { readVehicleCatalog } = await import("../src/lib/catalog-store");
    const { commercialListing } = await import("../src/lib/commercial-models");
    const catalog = await readVehicleCatalog();
    return {
      source,
      status: "ok",
      message: "Offline saved observations",
      observedAt: new Date().toISOString(),
      elapsedMs: 0,
      creditsReserved: 0,
      total: state.listings.length,
      partial: true,
      listings: state.listings.map((l) => commercialListing(catalog, l)),
    };
  }),
}));
const folder = mkdtempSync(
  path.join(process.env.RADAR_TEST_ROOT!, "olx-review-"),
);
process.env.DATABASE_URL =
  "file:" + path.join(folder, "test.db").replaceAll("\\", "/");
let db: typeof import("../src/lib/db").db;
let store: typeof import("../src/lib/discovery-store");
let radar: typeof import("../src/lib/radar");
const sent: { text: string; to: string[] }[] = [];
beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  db = (await import("../src/lib/db")).db;
  store = await import("../src/lib/discovery-store");
  radar = await import("../src/lib/radar");
}, 30000);
beforeEach(async () => {
  await db.radar.deleteMany();
  await db.savedSearch.deleteMany();
  await db.discoveredListing.deleteMany();
  await db.searchLock.deleteMany();
  await db.searchCache.deleteMany();
  await db.providerSpend.deleteMany();
  sent.length = 0;
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "true");
  vi.stubEnv("RADAR_EMAIL_ENABLED", "true");
  vi.stubEnv("RADAR_CRON_SECRET", "test-only-00000000000000000000000000000");
  vi.stubEnv("RADAR_APP_URL", "https://app.example.test");
  vi.stubEnv("RESEND_API_KEY", "test-only");
  vi.stubEnv("RADAR_EMAIL_FROM", "radar@example.test");
  vi.stubEnv("RADAR_EMAIL_TO", "owner@example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url !== "https://api.resend.com/emails" || options?.method !== "POST")
        throw Error("No external network in saved-observation test");
      sent.push(JSON.parse(options.body as string));
      return Response.json({ id: "mock-saved-observation-email" });
    }),
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await db.$disconnect();
});

it("reclassifies the 108 original baseline notices on API read without rewriting them", async () => {
  for (const group of fixture.groups) {
    const criteria = searchSchema.parse(group.criteria);
    const search = await store.saveSearch(criteria);
    const row = await radar.saveRadar({
      searchId: search.id,
      name: group.name,
      mode: "new_listings",
      channel: "both",
      enabled: false,
      runsRemaining: 0,
      minPercent: 10,
      intervalHours: 24,
    });
    const originalBaseline = group.listings.filter(
      (l) =>
        l.modelYear >= criteria.yearMin! &&
        (criteria.yearMax === null || l.modelYear <= criteria.yearMax) &&
        l.state === criteria.state,
    );
    for (const listing of originalBaseline)
      await db.radarNotice.create({
        data: {
          radarId: row.id,
          listingKey: "olx:" + listing.externalId,
          priceCents: listing.priceCents,
          eventKey: "legacy:" + listing.externalId,
          kind: "baseline",
          status: "recorded",
          channel: "both",
          matchStatus: "uncertain",
          emailEligible: false,
          payload: JSON.stringify(listing),
        },
      });
  }
  const before = await db.radarNotice.findMany({ orderBy: { id: "asc" } });
  expect(before).toHaveLength(108);
  const response = await (await import("../src/app/api/radars/route")).GET();
  expect(response.status).toBe(200);
  const result = await response.json();
  for (const group of fixture.groups) {
    const row = result.radars.find(
      (r: { name: string }) => r.name === group.name,
    );
    expect(row.notices).toHaveLength(
      group.expected.confirmed + group.expected.uncertain,
    );
    expect(
      row.notices.filter(
        (n: { matchStatus: string }) => n.matchStatus === "confirmed",
      ),
    ).toHaveLength(group.expected.confirmed);
  }
  expect(await db.radarNotice.findMany({ orderBy: { id: "asc" } })).toEqual(
    before,
  );
  expect(await db.providerSpend.count()).toBe(0);
  expect(sent).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});

it("only queues one mocked email for a new confirmed A4; other models and unseen labels stay out", async () => {
  const group = fixture.groups[1],
    criteria = searchSchema.parse(group.criteria);
  state.listings = structuredClone(group.listings) as Listing[];
  const search = await store.saveSearch(criteria);
  const row = await radar.saveRadar({
    searchId: search.id,
    name: group.name,
    mode: "new_listings",
    channel: "both",
    enabled: true,
    runsRemaining: 2,
    minPercent: 10,
    intervalHours: 24,
  });
  expect(await radar.tickRadars()).toEqual({ processed: 1 });
  expect(await db.radarNotice.count({ where: { kind: "baseline" } })).toBe(5);
  expect(sent).toHaveLength(0);
  const a4 = state.listings.find(
    (l) => l.sourceModel!.startsWith("A4") && l.modelYear! >= 2016,
  )!;
  const q3 = state.listings.find((l) => l.sourceModel!.startsWith("Q3"))!;
  const extra = (source: Listing, id: string) => ({
    ...structuredClone(source),
    externalId: id,
    title: id,
    url: `https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-only-${id}`,
  });
  state.listings.push(
    extra(a4, "TEST-NEW-CONFIRMED-A4"),
    extra(q3, "TEST-NEW-WRONG-Q3"),
    {
      ...extra(a4, "TEST-NEW-UNKNOWN"),
      sourceModel: "A4 Unreviewed Future Description",
      original: {
        brand: "Audi",
        model: "A4 Unreviewed Future Description",
        version: null,
      },
    },
  );
  await db.radar.update({
    where: { id: row.id },
    data: { nextRunAt: new Date(0) },
  });
  await db.searchRun.updateMany({ data: { createdAt: new Date(0) } });
  await db.searchCache.deleteMany();
  expect(await radar.tickRadars()).toEqual({ processed: 1 });
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toEqual(["owner@example.test"]);
  expect(sent[0].text).toContain("TEST-NEW-CONFIRMED-A4");
  expect(sent[0].text).not.toContain("TEST-NEW-WRONG-Q3");
  expect(sent[0].text).not.toContain("TEST-NEW-UNKNOWN");
  expect(
    await db.radarNotice.count({
      where: { listingKey: "olx:TEST-NEW-WRONG-Q3" },
    }),
  ).toBe(0);
  expect(
    await db.radarNotice.findFirst({
      where: { listingKey: "olx:TEST-NEW-UNKNOWN" },
    }),
  ).toMatchObject({ matchStatus: "uncertain", emailEligible: false });
  expect(await db.discoveredListing.count()).toBe(53);
  expect(await db.providerSpend.count()).toBe(0);
});
