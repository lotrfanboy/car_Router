import { beforeEach, expect, it, vi } from "vitest";
import fixture from "./fixtures/commercial-models.json";
const state = vi.hoisted(() => ({
  revision: "cache-a",
  fail: false,
  reads: 0,
  tables: 0,
}));
vi.mock("../src/lib/db", () => ({
  db: {
    catalogState: {
      findUnique: vi.fn(async () => {
        state.reads++;
        await Promise.resolve();
        if (state.fail) throw new Error("temporary database failure");
        return { activeRevisionId: state.revision };
      }),
    },
    catalogRevision: {
      findUniqueOrThrow: async () => ({
        id: state.revision,
        status: "active",
        createdAt: new Date(),
      }),
    },
    catalogSource: { findMany: async () => [] },
    catalogBrand: {
      findMany: async () => {
        state.tables++;
        return fixture.catalog.brands;
      },
    },
    catalogModel: { findMany: async () => fixture.catalog.models },
    catalogVersion: { findMany: async () => fixture.catalog.versions },
    catalogSourceMapping: { findMany: async () => [] },
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  state.revision = "cache-a";
  state.fail = false;
  state.reads = 0;
  state.tables = 0;
});
it("coalesces concurrent cold reads and checks the active revision at most every 30 seconds", async () => {
  let now = 100_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const { readVehicleCatalog } = await import("../src/lib/catalog-store");
  const rows = await Promise.all(
    Array.from({ length: 40 }, () => readVehicleCatalog()),
  );
  expect(new Set(rows).size).toBe(1);
  expect(state.reads).toBe(1);
  expect(state.tables).toBe(1);
  now += 29_999;
  expect(await readVehicleCatalog()).toBe(rows[0]);
  expect(state.reads).toBe(1);
  now += 1;
  state.revision = "cache-b";
  const refreshed = await Promise.all(
    Array.from({ length: 40 }, () => readVehicleCatalog()),
  );
  expect(new Set(refreshed).size).toBe(1);
  expect(refreshed[0].revision).toBe("cache-b");
  expect(state.reads).toBe(2);
  expect(state.tables).toBe(2);
});
it("retries after a failed cold load and retains a valid snapshot during a database outage", async () => {
  let now = 100_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const { readVehicleCatalog } = await import("../src/lib/catalog-store");
  state.fail = true;
  await expect(readVehicleCatalog()).rejects.toThrow("temporary");
  state.fail = false;
  const catalog = await readVehicleCatalog();
  now += 30_000;
  state.fail = true;
  expect(await readVehicleCatalog()).toBe(catalog);
  state.fail = false;
  state.revision = "cache-b";
  now += 30_000;
  expect((await readVehicleCatalog()).revision).toBe("cache-b");
});
