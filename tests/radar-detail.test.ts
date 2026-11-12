import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fixture from "./fixtures/olx-local-radars.json";
import { searchSchema, type Listing } from "../src/lib/discovery";
import {
  emptyRadarFilters,
  filterRadarOffers,
  evidencedRadarEvent,
  projectRadarOffers,
  radarSampleSummary,
  type RadarNoticeView,
} from "../src/lib/radar-presentation";

const folder = mkdtempSync(
  path.join(process.env.RADAR_TEST_ROOT!, "radar-detail-"),
);
process.env.DATABASE_URL =
  "file:" + path.join(folder, "test.db").replaceAll("\\", "/");
let db: typeof import("../src/lib/db").db;
let detail: typeof import("../src/lib/radar-detail");
const ids: string[] = [];
const network = vi.fn(() => {
  throw Error("No provider/email calls allowed in radar detail tests");
});
beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  db = (await import("../src/lib/db")).db;
  detail = await import("../src/lib/radar-detail");
  vi.stubGlobal("fetch", network);
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "false");
  vi.stubEnv("RADAR_EMAIL_ENABLED", "false");
  const { saveSearch } = await import("../src/lib/discovery-store");
  const { saveRadar } = await import("../src/lib/radar");
  for (const group of fixture.groups) {
    const criteria = searchSchema.parse(group.criteria);
    const search = await saveSearch(criteria);
    await db.searchRun.create({
      data: {
        searchId: search.id,
        createdAt: new Date("2026-11-03T18:00:00Z"),
        result: JSON.stringify({
          sources: [
            {
              source: "olx",
              status: "ok",
              partial: true,
              message: "Saved observation",
              observedAt: "2026-11-03T18:00:00Z",
              elapsedMs: 0,
              creditsReserved: 0,
              total: 50,
              listings: group.listings,
            },
          ],
        }),
      },
    });
    const radar = await saveRadar({
      searchId: search.id,
      name: group.name,
      minPercent: 10,
      intervalHours: 24,
      enabled: false,
      runsRemaining: 0,
      mode: "new_listings",
      channel: "both",
    });
    ids.push(radar.id);
  }
}, 30000);
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await db.$disconnect();
});

it("shows only current matches per radar, preserves uncertainty and never labels the baseline as new", async () => {
  for (const [i, group] of fixture.groups.entries()) {
    const data = (await detail.getRadarDetail(ids[i]))!;
    expect(
      data.offers.filter((o) => o.matchStatus === "confirmed"),
    ).toHaveLength(group.expected.confirmed);
    expect(
      data.offers.filter((o) => o.matchStatus === "uncertain"),
    ).toHaveLength(group.expected.uncertain);
    expect(data.offers.every((o) => o.event === null)).toBe(true);
    const summary = radarSampleSummary(data.offers);
    expect(summary.count).toBe(group.expected.confirmed);
    expect(summary.review).toBe(group.expected.uncertain);
    const listingCopies = data.offers.flatMap((o) => [o.listing, o.listing]);
    const projected = projectRadarOffers(data.radar, {
      id: data.radar.searchId,
      criteria: data.radar.criteria,
      latest: {
        createdAt: "2026-11-03T18:00:00Z",
        sources: [
          {
            source: "olx",
            status: "ok",
            partial: true,
            message: "Saved duplicate projection",
            observedAt: "2026-11-03T18:00:00Z",
            elapsedMs: 0,
            creditsReserved: 0,
            total: listingCopies.length,
            listings: listingCopies,
          },
        ],
      },
    });
    expect(projected.offers).toHaveLength(data.offers.length);
    expect(radarSampleSummary(projected.offers)).toEqual(summary);

    expect(data.radar.state).toBe("paused");
    expect(data.emailEnabled).toBe(false);
    expect(data.sources).toMatchObject([
      { source: "olx", status: "ok", partial: true, historical: false },
    ]);
    expect(data.lastConsultedAt).toBe("2026-11-03T18:00:00.000Z");
  }
  expect(network).not.toHaveBeenCalled();
  expect(await db.radarRun.count()).toBe(0);
  expect(await db.providerSpend.count()).toBe(0);
  expect(await db.radarEmailDelivery.count()).toBe(0);
});
it("filters locally by price, year, km, city, source, query and evidence without changing the saved criteria", async () => {
  const data = (await detail.getRadarDetail(ids[0]))!;
  const filters = {
    ...emptyRadarFilters,
    priceMax: "250000",
    yearMin: "2019",
    mileageMax: "150000",
    sort: "priceAsc",
  };
  const rows = filterRadarOffers(data.offers, filters);
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.every(
      (o) =>
        o.listing.priceCents! <= 25000000 &&
        o.listing.modelYear! >= 2019 &&
        o.listing.mileage! <= 150000,
    ),
  ).toBe(true);
  expect(rows.map((o) => o.listing.priceCents)).toEqual(
    rows.map((o) => o.listing.priceCents).sort((a, b) => a! - b!),
  );
  const city = rows[0].listing.city!;
  expect(
    filterRadarOffers(data.offers, { ...filters, city, source: "olx" }).every(
      (o) => o.listing.city === city,
    ),
  ).toBe(true);
  expect(
    filterRadarOffers(data.offers, {
      ...emptyRadarFilters,
      source: "webmotors",
    }),
  ).toHaveLength(0);
  expect(
    filterRadarOffers(data.offers, {
      ...emptyRadarFilters,
      query: "não existe esta oferta",
    }),
  ).toHaveLength(0);
  expect(
    filterRadarOffers(data.offers, {
      ...emptyRadarFilters,
      event: "new_listing",
    }),
  ).toHaveLength(0);
  expect(
    filterRadarOffers(data.offers, {
      ...emptyRadarFilters,
      event: "price_drop",
    }),
  ).toHaveLength(0);
  expect(
    filterRadarOffers(data.offers, {
      ...emptyRadarFilters,
      match: "uncertain",
    }),
  ).toHaveLength(1);
  expect(
    (await detail.getRadarDetail(ids[0]))!.radar.criteria.priceMax,
  ).toBeNull();
  expect(network).not.toHaveBeenCalled();
});
it("keeps previous observations visibly historical after a failed query and returns 404 for an unknown radar", async () => {
  const row = (await detail.getRadarDetail(ids[1]))!.radar;
  await db.searchRun.create({
    data: {
      searchId: row.searchId,
      createdAt: new Date("2026-11-03T19:00:00Z"),
      result: JSON.stringify({
        sources: [
          {
            source: "olx",
            status: "error",
            partial: false,
            message: "Simulated offline",
            observedAt: "2026-11-03T19:00:00Z",
            listings: [],
          },
        ],
      }),
    },
  });
  const result = (await detail.getRadarDetail(row.id))!;
  expect(result.offers).toHaveLength(5);
  expect(result.offers.every((o) => o.historical)).toBe(true);
  expect(result.sources).toMatchObject([{ status: "error", historical: true }]);
  const route = await import("../src/app/api/radars/[id]/route");
  expect(
    (
      await route.GET(new Request("http://localhost/api/radars/unknown"), {
        params: Promise.resolve({ id: "unknown" }),
      })
    ).status,
  ).toBe(404);
  expect(network).not.toHaveBeenCalled();
});
it("requires a persisted confirmed event at the current price before showing new or price-drop badges", () => {
  const listing = fixture.groups[0].listings[0] as Listing;
  const notice: RadarNoticeView = {
    id: "event",
    kind: "baseline",
    listing,
    matchStatus: "confirmed",
    priceCents: listing.priceCents!,
    previousPriceCents: null,
    createdAt: "2026-11-03T18:00:00Z",
  };
  expect(
    evidencedRadarEvent(
      {
        ...listing,
        isNew: true,
        previousPriceCents: listing.priceCents! + 100000,
      },
      [notice],
    ),
  ).toBeNull();
  expect(
    evidencedRadarEvent(listing, [{ ...notice, kind: "new_listing" }])?.kind,
  ).toBe("new_listing");
  expect(
    evidencedRadarEvent(listing, [
      { ...notice, kind: "new_listing", matchStatus: "uncertain" },
    ]),
  ).toBeNull();
  expect(
    evidencedRadarEvent(listing, [
      {
        ...notice,
        kind: "price_drop",
        previousPriceCents: listing.priceCents! + 100000,
      },
    ])?.kind,
  ).toBe("price_drop");
  expect(
    evidencedRadarEvent(listing, [
      { ...notice, kind: "price_drop", previousPriceCents: listing.priceCents },
    ]),
  ).toBeNull();
  expect(
    evidencedRadarEvent(listing, [
      { ...notice, kind: "new_listing", priceCents: 1 },
    ]),
  ).toBeNull();
});
it("owns cadence and allowance on the server and never replenishes or resumes through ordinary editing", async () => {
  const { managedRadarPolicy, saveRadarPreferences, pauseRadar } =
    await import("../src/lib/radar-preferences");
  for (const value of [undefined, "", "-1", "1.5", "101", "Infinity"])
    expect(managedRadarPolicy(value).runsRemaining).toBe(0);
  expect(managedRadarPolicy("3")).toEqual({
    intervalHours: 24,
    runsRemaining: 3,
  });
  vi.stubEnv("RADAR_MANAGED_RUN_LIMIT", "");
  const existing = (await detail.getRadarDetail(ids[2]))!.radar;
  const created = await saveRadarPreferences({
    experience: "managed",
    name: "Offline created radar",
    searchId: existing.searchId,
    enabled: true,
    runsRemaining: 100,
    intervalHours: 1,
  });
  expect(created).toMatchObject({
    enabled: false,
    runsRemaining: 0,
    intervalHours: 24,
    channel: "both",
    mode: "new_listings",
    nextRunAt: null,
  });
  vi.stubEnv("RADAR_MANAGED_RUN_LIMIT", "100");
  const edited = await saveRadarPreferences(
    {
      experience: "managed",
      name: "Renamed only",
      searchId: existing.searchId,
    },
    existing.id,
  );
  expect(edited).toMatchObject({
    enabled: false,
    runsRemaining: 0,
    nextRunAt: null,
  });
  await db.radar.update({
    where: { id: created.id },
    data: { enabled: true, runsRemaining: 3, nextRunAt: new Date() },
  });
  expect(await pauseRadar(created.id)).toMatchObject({
    enabled: false,
    runsRemaining: 3,
    nextRunAt: null,
  });
  expect(network).not.toHaveBeenCalled();
  expect(await db.providerSpend.count()).toBe(0);
});

it("computes sample prices only from confirmed, positive priced offers", () => {
  const base = fixture.groups[0].listings[0] as Listing;
  const offers = [10000, 30000, 0, null].map((priceCents) => ({
    listing: { ...base, priceCents },
    matchStatus: "confirmed" as const,
    historical: false,
    event: null,
  }));
  offers.push({
    listing: { ...base, priceCents: 999999 },
    matchStatus: "uncertain" as never,
    historical: false,
    event: null,
  });
  expect(radarSampleSummary(offers)).toEqual({
    count: 4,
    review: 1,
    minimum: 10000,
    maximum: 30000,
    mean: 20000,
    pricedCount: 2,
  });
  expect(radarSampleSummary([])).toEqual({
    count: 0,
    review: 0,
    minimum: null,
    maximum: null,
    mean: null,
    pricedCount: 0,
  });
});
