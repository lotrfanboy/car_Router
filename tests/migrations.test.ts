import { readFileSync, mkdtempSync } from "node:fs";

import path from "node:path";
import { PrismaClient } from "@prisma/client";
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
    await apply("prisma/migrations/20261021000000_init/migration.sql");
    await client.$executeRawUnsafe(
      `INSERT INTO Vehicle (id, brand, model, manufactureYear, modelYear, mileage, priceCents, source, favorite, createdAt, updatedAt) VALUES ('old', 'Toyota', 'Corolla', 2020, 2021, 50000, 9000000, 'Manual', true, '2020-01-01', '2020-01-01')`,
    );
    const before = await client.vehicle.findUniqueOrThrow({
      where: { id: "old" },
    });
    await apply("prisma/migrations/20261021010000_price_history/migration.sql");
    expect(await client.vehicle.findUnique({ where: { id: "old" } })).toEqual(
      before,
    );
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
    await apply("prisma/migrations/20261021020000_discovery/migration.sql");
    expect(await client.vehicle.findUnique({ where: { id: "old" } })).toEqual(
      before,
    );
    expect(await client.vehiclePrice.findMany()).toEqual(history);
    expect(await client.savedSearch.count()).toBe(0);
  } finally {
    await client.$disconnect();
  }
});
