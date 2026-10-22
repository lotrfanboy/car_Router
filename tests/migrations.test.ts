import { readFileSync, mkdtempSync } from "node:fs";

import path from "node:path";
import { PrismaClient } from "../src/generated/prisma-sqlite";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { expect, it } from "vitest";

it("adds a current-price baseline to an existing database without changing vehicles", async () => {
  const folder = mkdtempSync(
    path.join(process.env.RADAR_TEST_ROOT!, "radar-upgrade-"),
  );
  const client = new PrismaClient({
    adapter: new PrismaLibSQL({
      url: "file:" + path.join(folder, "old.db").replaceAll("\\", "/"),
    }),
  });
  try {
    const apply = async (file: string) => {
      const sql = readFileSync(file, "utf8").replace(/^--.*$/gm, "");
      for (const statement of sql.split(";").filter((s) => s.trim())) {
        await client.$executeRawUnsafe(statement);
      }
    };
    await apply("prisma/sqlite/migrations/20261021000000_init/migration.sql");
    await client.$executeRawUnsafe(
      `INSERT INTO Vehicle (id, brand, model, manufactureYear, modelYear, mileage, priceCents, source, favorite, createdAt, updatedAt) VALUES ('old', 'Toyota', 'Corolla', 2020, 2021, 50000, 9000000, 'Manual', true, '2020-01-01', '2020-01-01')`,
    );
    const legacySelect = {
      id: true,
      brand: true,
      model: true,
      manufactureYear: true,
      modelYear: true,
      mileage: true,
      priceCents: true,
      source: true,
      favorite: true,
      createdAt: true,
      updatedAt: true,
    } as const;
    const before = await client.vehicle.findUniqueOrThrow({
      where: { id: "old" },
      select: legacySelect,
    });
    await apply(
      "prisma/sqlite/migrations/20261021010000_price_history/migration.sql",
    );
    expect(
      await client.vehicle.findUnique({
        where: { id: "old" },
        select: legacySelect,
      }),
    ).toEqual(before);
    const history = await client.vehiclePrice.findMany();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      vehicleId: "old",
      priceCents: 9000000,
      reason: "baseline",
    });
    expect(history[0].observedAt.getTime()).toBeGreaterThan(
      new Date("2020-01-02").getTime(),
    );
    await apply(
      "prisma/sqlite/migrations/20261021020000_discovery/migration.sql",
    );
    expect(
      await client.vehicle.findUnique({
        where: { id: "old" },
        select: legacySelect,
      }),
    ).toEqual(before);
    expect(await client.vehiclePrice.findMany()).toEqual(history);
    expect(await client.savedSearch.count()).toBe(0);
    await apply(
      "prisma/sqlite/migrations/20261021030000_olx_locations/migration.sql",
    );
    expect(
      await client.vehicle.findUnique({
        where: { id: "old" },
        select: legacySelect,
      }),
    ).toEqual(before);
    expect(await client.vehiclePrice.findMany()).toEqual(history);
    expect(await client.olxLocation.count()).toBe(0);

    // Preserve existing provider searches, observations and location cache while
    // adding independent local catalog filters.
    const search = await client.savedSearch.create({
      data: { name: "Busca anterior", criteria: '{"brand":"Toyota"}' },
      select: { id: true, name: true, criteria: true, createdAt: true },
    });
    const run = await client.searchRun.create({
      data: { searchId: search.id, result: '{"listings":[]}' },
    });
    const discovered = await client.discoveredListing.create({
      data: {
        source: "fixture",
        externalId: "before-migration",
        payload: "{}",
      },
      select: {
        id: true,
        source: true,
        externalId: true,
        payload: true,
        firstSeen: true,
        lastSeen: true,
      },
    });
    const discoveredPrice = await client.listingPrice.create({
      data: { listingId: discovered.id, priceCents: 9000000 },
    });
    const location = await client.olxLocation.create({
      data: { id: "cached-location", region: "regiao-de-curitiba-e-paranagua" },
    });
    const spend = await client.providerSpend.create({
      data: { provider: "fixture", credits: 1 },
    });
    await apply(
      "prisma/sqlite/migrations/20261021040000_catalog_searches/migration.sql",
    );
    expect(
      await client.vehicle.findUnique({
        where: { id: "old" },
        select: legacySelect,
      }),
    ).toEqual(before);
    expect(await client.vehiclePrice.findMany()).toEqual(history);
    expect(
      await client.savedSearch.findMany({
        select: { id: true, name: true, criteria: true, createdAt: true },
      }),
    ).toEqual([search]);
    expect(await client.searchRun.findMany()).toEqual([run]);
    expect(
      await client.discoveredListing.findMany({
        select: {
          id: true,
          source: true,
          externalId: true,
          payload: true,
          firstSeen: true,
          lastSeen: true,
        },
      }),
    ).toEqual([discovered]);
    expect(await client.listingPrice.findMany()).toEqual([discoveredPrice]);
    expect(await client.olxLocation.findMany()).toEqual([location]);
    expect(await client.providerSpend.findMany()).toEqual([spend]);
    expect(await client.catalogSearch.count()).toBe(0);
    await apply(
      "prisma/sqlite/migrations/20261021050000_vehicle_seller_type/migration.sql",
    );
    const migratedVehicle = await client.vehicle.findUniqueOrThrow({
      where: { id: "old" },
    });
    expect(migratedVehicle.source).toBe("Manual");
    expect(migratedVehicle.sellerType).toBeNull();
    await apply(
      "prisma/sqlite/migrations/20261021060000_search_focus/migration.sql",
    );
    expect(await client.vehicle.findUnique({ where: { id: "old" } })).toEqual(
      migratedVehicle,
    );
    expect(await client.vehiclePrice.findMany()).toEqual(history);
    expect(await client.savedSearch.findMany()).toEqual([
      { ...search, queryKey: null },
    ]);
    expect(await client.searchRun.findMany()).toEqual([run]);
    expect(await client.discoveredListing.findMany()).toEqual([
      { ...discovered, savedAt: null },
    ]);
    expect(await client.listingPrice.findMany()).toEqual([discoveredPrice]);
    expect(await client.olxLocation.findMany()).toEqual([location]);
    expect(await client.providerSpend.findMany()).toEqual([spend]);
    expect(await client.radar.count()).toBe(0);
  } finally {
    await client.$disconnect();
  }
});
