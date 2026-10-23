import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fixture from "./fixtures/commercial-models.json";
import { searchSchema, type Listing } from "../src/lib/discovery";
const state = vi.hoisted(() => ({ seen: [] as unknown[] }));
vi.mock("../src/lib/discovery-providers", async (original) => ({
  ...(await original<typeof import("../src/lib/discovery-providers")>()),
  providerConfig: () => ({ configured: true, provider: "gecko", cost: 1 }),
  fetchSource: vi.fn(async (source, criteria) => {
    state.seen.push(criteria);
    return {
      source,
      status: "ok",
      message: "Offline store probe",
      observedAt: new Date().toISOString(),
      elapsedMs: 1,
      creditsReserved: 0,
      total: 0,
      partial: false,
      listings: [],
    };
  }),
}));
const directory = mkdtempSync(
  path.join(process.env.RADAR_TEST_ROOT!, "commercial-"),
);
process.env.DATABASE_URL = "file:" + path.join(directory, "test.db");
let db: typeof import("../src/lib/db").db;
let store: typeof import("../src/lib/discovery-store");
let radar: typeof import("../src/lib/radar");
const raw = fixture.catalog;
const brand = raw.brands.find((row) => row.name === "CHEVROLET")!;
const model = raw.models.find((row) => row.name === "Celta 4P")!;
const old = searchSchema.parse({
  name: "Preserve this saved search",
  brand: brand.name,
  model: model.name,
  state: "SC",
  version: "",
  yearMin: 2006,
  yearMax: 2006,
  priceMax: null,
  mileageMax: null,
  privateOnly: false,
  sources: ["olx"],
  catalog: {
    provider: "carrouter",
    revision: raw.revision,
    brandCode: brand.id,
    brandName: brand.name,
    modelCode: model.id,
    modelName: model.name,
  },
});
beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  db = (await import("../src/lib/db")).db;
  await db.catalogRevision.create({
    data: {
      id: raw.revision,
      schemaVersion: "1",
      sourceSha256: "a".repeat(64),
      status: "active",
      brandCount: raw.brands.length,
      modelCount: raw.models.length,
      versionCount: raw.versions.length,
      evidenceCount: 0,
      modelsWithoutVersion: 0,
    },
  });
  for (const row of raw.brands)
    await db.catalogBrand.create({
      data: {
        revisionId: raw.revision,
        id: row.id,
        name: row.name,
        sourceIds: "[]",
        sourceLabels: "[]",
        identityDecisionIds: "[]",
      },
    });
  for (const row of raw.models)
    await db.catalogModel.create({
      data: {
        revisionId: raw.revision,
        id: row.id,
        name: row.name,
        brandId: row.brandId,
        sourceIds: "[]",
        sourceLabels: "[]",
        versionsPending: false,
        hasAcceptedVersions: true,
      },
    });
  for (const row of raw.versions)
    await db.catalogVersion.create({
      data: {
        revisionId: raw.revision,
        id: row.id,
        modelId: row.modelId,
        name: row.name,
        engine: row.engine,
        transmission: row.transmission,
        sourceIds: "[]",
        sourceLabels: "[]",
      },
    });
  await db.catalogState.create({
    data: { id: "vehicle-catalog", activeRevisionId: raw.revision },
  });
  store = await import("../src/lib/discovery-store");
  radar = await import("../src/lib/radar");
}, 30000);
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await db?.$disconnect();
});

it("adapts saved selections and favorites on read and retains saved-search, run and radar IDs", async () => {
  const saved = await db.savedSearch.create({
    data: {
      name: old.name,
      criteria: JSON.stringify(old),
      queryKey: "legacy-key",
    },
  });
  const historical: Listing = {
    source: "webmotors",
    externalId: "historical-celta",
    title: "Historical observation",
    url: "https://www.webmotors.com.br/comprar/chevrolet/celta/test/1",
    brand: "CHEVROLET",
    model: "CELTA",
    version: "1.0 MPFI SPIRIT 8V FLEX 2P MANUAL",
    sourceModel: "CELTA",
    sourceIdentity: { brandId: "2", modelId: "1143", versionId: "339982" },
    original: {
      brand: "CHEVROLET",
      model: "CELTA",
      version: "1.0 MPFI SPIRIT 8V FLEX 2P MANUAL",
    },
    modelYear: 2006,
    state: "SC",
    city: null,
    priceCents: 1000000,
    mileage: 100000,
    sellerType: "private",
    observedAt: new Date().toISOString(),
    reasons: ["Modelo não classificado"],
  };
  const run = await db.searchRun.create({
    data: {
      searchId: saved.id,
      createdAt: new Date(0),
      result: JSON.stringify({
        sources: [
          {
            source: "webmotors",
            status: "ok",
            observedAt: historical.observedAt,
            creditsReserved: 0,
            elapsedMs: 1,
            partial: false,
            total: 1,
            message: "Historical",
            listings: [historical],
          },
        ],
      }),
    },
  });
  const monitor = await radar.saveRadar({
    searchId: saved.id,
    name: "Preserved radar",
    minPercent: 0,
    intervalHours: 24,
    enabled: false,
    mode: "new_listings",
    channel: "in_app",
  });
  const view = (await store.listSearches()).find((row) => row.id === saved.id)!;
  expect(view.criteria).toMatchObject({
    model: "Celta",
    doors: 4,
    yearMin: 2006,
    yearMax: 2006,
    catalog: { configurationCode: model.id },
  });
  expect(view.latest?.id).toBe(run.id);
  expect(view.latest?.sources[0].listings[0]).toMatchObject({
    model: "Celta",
    doors: 2,
    reasons: ["Número de portas diferente"],
  });
  expect((await radar.listRadars()).radars[0]).toMatchObject({
    id: monitor.id,
    searchId: saved.id,
    criteria: { model: "Celta", doors: 4 },
  });
  // Reads do not mutate immutable technical records or stored historical executions.
  expect(
    (await db.savedSearch.findUniqueOrThrow({ where: { id: saved.id } }))
      .criteria,
  ).toBe(JSON.stringify(old));
  expect(
    (await db.searchRun.findUniqueOrThrow({ where: { id: run.id } })).result,
  ).toContain('"model":"CELTA"');
  const sameSearch = await store.saveSearch(view.criteria);
  expect(sameSearch.id).toBe(saved.id);
  expect(await db.savedSearch.count()).toBe(1);
  expect(await db.radar.count({ where: { searchId: saved.id } })).toBe(1);
  await store.executeSearch(saved.id);
  expect(state.seen[0]).toMatchObject({
    model: "Celta",
    doors: 4,
    yearMin: 2006,
    yearMax: 2006,
  });
  expect(await db.catalogModel.count()).toBe(raw.models.length);
  expect(await db.catalogVersion.count()).toBe(raw.versions.length);
});

it("loads one shared observation universe for all saved searches and recovered history", async () => {
  const existing = await db.searchRun.findFirstOrThrow();
  for (let i = 0; i < 3; i++) {
    const saved = await db.savedSearch.create({
      data: {
        name: `Batch ${i}`,
        criteria: JSON.stringify({ ...old, name: `Batch ${i}` }),
      },
    });
    await db.searchRun.create({
      data: {
        searchId: saved.id,
        result: existing.result,
        createdAt: new Date(0),
      },
    });
    await db.searchRun.create({
      data: {
        searchId: saved.id,
        result: JSON.stringify({
          sources: [{ source: "olx", status: "error", listings: [] }],
        }),
        createdAt: new Date(1),
      },
    });
  }
  const read = vi.spyOn(db.discoveredListing, "findMany");
  try {
    const searches = await store.listSearches();
    expect(searches.length).toBe(4);
    expect(read).toHaveBeenCalledTimes(1);
    expect(searches.filter((search) => search.lastSuccessful)).toHaveLength(3);
  } finally {
    read.mockRestore();
  }
});
