import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma-sqlite";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { expect, it } from "vitest";

const migration = "20261023024810_radar_internal_events";
const migrationsRoot = "prisma/sqlite/migrations";

it("adds internal radar events while preserving legacy settings, notices and history", async () => {
  const folder = mkdtempSync(
    path.join(process.env.RADAR_TEST_ROOT!, "radar-events-upgrade-"),
  );
  const client = new PrismaClient({
    adapter: new PrismaLibSQL({
      url: "file:" + path.join(folder, "legacy.db").replaceAll("\\", "/"),
    }),
  });
  const apply = async (name: string) => {
    const sql = readFileSync(
      path.join(migrationsRoot, name, "migration.sql"),
      "utf8",
    ).replace(/^--.*$/gm, "");
    for (const statement of sql.split(";").filter((value) => value.trim()))
      await client.$executeRawUnsafe(statement);
  };
  try {
    await client.$executeRawUnsafe("PRAGMA foreign_keys=ON");
    for (const name of readdirSync(migrationsRoot).sort())
      if (/^\d+_/.test(name) && name < migration) await apply(name);

    await client.$executeRawUnsafe(`INSERT INTO "SavedSearch"
      (id, name, criteria, queryKey) VALUES
      ('legacy-search', 'BMW 320i PR', '{"state":"PR","yearMin":2016}', 'legacy-key')`);
    await client.$executeRawUnsafe(`INSERT INTO "SearchRun"
      (id, searchId, result) VALUES ('legacy-search-run', 'legacy-search', '{"sources":[]}')`);
    await client.$executeRawUnsafe(`INSERT INTO "DiscoveredListing"
      (id, source, externalId, payload, savedAt) VALUES
      ('legacy-listing', 'olx', 'legacy-car', '{"model":"320i"}', '2026-10-22 15:00:00')`);
    await client.$executeRawUnsafe(`INSERT INTO "ListingPrice"
      (listingId, priceCents) VALUES ('legacy-listing', 12000000)`);
    await client.$executeRawUnsafe(`INSERT INTO "ProviderSpend"
      (provider, credits) VALUES ('gecko', 1)`);
    await client.$executeRawUnsafe(`INSERT INTO "Radar"
      (id, searchId, name, minPercent, intervalHours, enabled, lastRunAt, nextRunAt, updatedAt)
      VALUES ('legacy-radar', 'legacy-search', 'Oferta anterior', 12.5, 168, true,
      '2026-10-22 15:00:00', '2026-10-29 15:00:00', '2026-10-22 15:00:00')`);
    await client.$executeRawUnsafe(`INSERT INTO "RadarRun"
      (id, radarId, finishedAt, status, message) VALUES
      ('legacy-radar-run', 'legacy-radar', '2026-10-22 15:01:00', 'ok', 'Aviso confirmado')`);
    await client.$executeRawUnsafe(`INSERT INTO "RadarNotice"
      (id, radarId, listingKey, priceCents, eventKey, status, sentAt) VALUES
      ('legacy-notice', 'legacy-radar', 'olx:legacy-car', 12000000, 'legacy-event',
      'sent', '2026-10-22 15:01:00')`);

    const tables = [
      "SavedSearch",
      "SearchRun",
      "DiscoveredListing",
      "ListingPrice",
      "ProviderSpend",
      "Radar",
      "RadarRun",
      "RadarNotice",
    ];
    const before = new Map<string, Record<string, unknown>[]>();
    for (const table of tables)
      before.set(
        table,
        await client.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM "${table}"`,
        ),
      );

    await apply(migration);

    for (const table of tables) {
      const legacy = before.get(table)!;
      const columns = Object.keys(legacy[0])
        .map((column) => `"${column}"`)
        .join(", ");
      expect(
        await client.$queryRawUnsafe(`SELECT ${columns} FROM "${table}"`),
      ).toEqual(legacy);
    }
    expect(
      await client.$queryRawUnsafe(
        'SELECT mode, channel, runsRemaining FROM "Radar"',
      ),
    ).toEqual([{ mode: "discount", channel: "email", runsRemaining: null }]);
    expect(
      await client.$queryRawUnsafe(
        'SELECT kind, channel, matchStatus, payload, previousPriceCents FROM "RadarNotice"',
      ),
    ).toEqual([
      {
        kind: "discount",
        channel: "email",
        matchStatus: "confirmed",
        payload: null,
        previousPriceCents: null,
      },
    ]);
    expect(
      await client.$queryRawUnsafe('SELECT * FROM "RadarSourceState"'),
    ).toEqual([]);
    expect(
      await client.$queryRawUnsafe('SELECT * FROM "RadarObservation"'),
    ).toEqual([]);

    // Omitting the new options still creates a legacy discount/email radar.
    await client.$executeRawUnsafe(`INSERT INTO "Radar"
      (id, searchId, name, minPercent, updatedAt) VALUES
      ('new-radar', 'legacy-search', 'Outro radar', 10, '2026-10-23 00:00:00')`);
    expect(
      await client.$queryRawUnsafe(
        "SELECT mode, channel, runsRemaining FROM \"Radar\" WHERE id = 'new-radar'",
      ),
    ).toEqual([{ mode: "discount", channel: "email", runsRemaining: null }]);

    // Each source and listing has independent state per radar, with deduplication.
    for (const radarId of ["legacy-radar", "new-radar"]) {
      await client.$executeRawUnsafe(
        `INSERT INTO "RadarSourceState" (radarId, source, initializedAt)
        VALUES (?, 'olx', '2026-10-23 00:00:00')`,
        radarId,
      );
      await client.$executeRawUnsafe(
        `INSERT INTO "RadarObservation"
        (radarId, listingKey, priceCents, lastNotifiedPriceCents, firstSeenAt, lastSeenAt)
        VALUES (?, 'olx:legacy-car', 12000000, 12000000,
        '2026-10-23 00:00:00', '2026-10-23 00:00:00')`,
        radarId,
      );
    }
    await expect(
      client.$executeRawUnsafe(`INSERT INTO "RadarSourceState"
        (radarId, source, initializedAt) VALUES
        ('legacy-radar', 'olx', '2026-10-23 00:00:00')`),
    ).rejects.toThrow();
    await expect(
      client.$executeRawUnsafe(`INSERT INTO "RadarObservation"
        (radarId, listingKey, firstSeenAt, lastSeenAt) VALUES
        ('legacy-radar', 'olx:legacy-car', '2026-10-23 00:00:00', '2026-10-23 00:00:00')`),
    ).rejects.toThrow();
    await expect(
      client.$executeRawUnsafe(`INSERT INTO "RadarSourceState"
        (radarId, source, initializedAt) VALUES
        ('missing-radar', 'olx', '2026-10-23 00:00:00')`),
    ).rejects.toThrow();
    await expect(
      client.$executeRawUnsafe(`INSERT INTO "RadarObservation"
        (radarId, listingKey, firstSeenAt, lastSeenAt) VALUES
        ('missing-radar', 'olx:new-car', '2026-10-23 00:00:00', '2026-10-23 00:00:00')`),
    ).rejects.toThrow();
    await expect(
      client.$executeRawUnsafe(`INSERT INTO "RadarNotice"
        (id, radarId, listingKey, priceCents, eventKey, status) VALUES
        ('duplicate-notice', 'new-radar', 'olx:another-car', 11000000, 'legacy-event', 'stored')`),
    ).rejects.toThrow();
    await expect(
      client.$executeRawUnsafe(
        "DELETE FROM \"SavedSearch\" WHERE id = 'legacy-search'",
      ),
    ).rejects.toThrow();

    await client.$executeRawUnsafe(
      "DELETE FROM \"Radar\" WHERE id = 'new-radar'",
    );
    expect(
      await client.$queryRawUnsafe('SELECT radarId FROM "RadarSourceState"'),
    ).toEqual([{ radarId: "legacy-radar" }]);
    expect(
      await client.$queryRawUnsafe('SELECT radarId FROM "RadarObservation"'),
    ).toEqual([{ radarId: "legacy-radar" }]);
    expect(
      await client.$queryRawUnsafe('SELECT id, status FROM "RadarNotice"'),
    ).toEqual([{ id: "legacy-notice", status: "sent" }]);
    expect(await client.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual(
      [],
    );
  } finally {
    await client.$disconnect();
  }
});
