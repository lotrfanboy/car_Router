import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";

import path from "node:path";
import { execFileSync } from "node:child_process";
const folder = mkdtempSync(
  path.join(process.env.RADAR_TEST_ROOT!, "radar-test-"),
);
process.env.DATABASE_URL =
  "file:" + path.join(folder, "test.db").replaceAll("\\", "/");
let collection: typeof import("../src/app/api/vehicles/route");
let item: typeof import("../src/app/api/vehicles/[id]/route");
let db: typeof import("../src/lib/db");
let prices: typeof import("../src/app/api/vehicles/[id]/prices/route");
const data = {
  brand: "Toyota",
  model: "Corolla",
  manufactureYear: 2020,
  modelYear: 2021,
  mileage: 50000,
  priceCents: 9000000,
  referenceCents: 10000000,
  source: "Teste",
};
const request = (
  method: string,
  body?: unknown,
  origin = "http://localhost:3000",
) =>
  new Request("http://localhost:3000/api/vehicles", {
    method,
    headers: { "Content-Type": "application/json", origin },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  collection = await import("../src/app/api/vehicles/route");
  item = await import("../src/app/api/vehicles/[id]/route");
  db = await import("../src/lib/db");
  prices = await import("../src/app/api/vehicles/[id]/prices/route");
}, 30000);
afterAll(async () => {
  await db?.db.$disconnect();
});
describe("HTTP routes with isolated SQLite and real migrations", () => {
  it("starts empty, creates, reads, updates, favorites, persists across reconnection and deletes", async () => {
    expect(await (await collection.GET()).json()).toEqual([]);
    const created = await collection.POST(request("POST", data));
    expect(created.status).toBe(201);
    const v = await created.json();
    const ctx = { params: Promise.resolve({ id: v.id }) };
    expect((await (await item.GET(request("GET"), ctx)).json()).model).toBe(
      "Corolla",
    );
    expect(
      (await item.PUT(request("PUT", { ...data, model: "Corolla XEi" }), ctx))
        .status,
    ).toBe(200);
    expect(
      (
        await (
          await item.PATCH(request("PATCH", { favorite: true }), ctx)
        ).json()
      ).favorite,
    ).toBe(true);
    await db.db.$disconnect();
    const persisted = await (await collection.GET()).json();
    expect(persisted[0].model).toBe("Corolla XEi");
    expect(persisted[0].favorite).toBe(true);
    expect((await item.DELETE(request("DELETE"), ctx)).status).toBe(204);
    expect((await item.GET(request("GET"), ctx)).status).toBe(404);
    expect((await item.PUT(request("PUT", data), ctx)).status).toBe(404);
    expect((await item.DELETE(request("DELETE"), ctx)).status).toBe(404);
    expect(await (await collection.GET()).json()).toEqual([]);
  });
  it("records only real price changes, persists history, and deletes it with the vehicle", async () => {
    const v = await (await collection.POST(request("POST", data))).json();
    const ctx = { params: Promise.resolve({ id: v.id }) };
    const history = async () => (await prices.GET(request("GET"), ctx)).json();
    expect(await history()).toMatchObject([
      { priceCents: data.priceCents, reason: "created" },
    ]);
    await item.PUT(request("PUT", { ...data, model: "Edited" }), ctx);
    await item.PATCH(request("PATCH", { favorite: true }), ctx);
    expect(await history()).toHaveLength(1);
    await item.PUT(request("PUT", { ...data, priceCents: 8500000 }), ctx);
    await item.PUT(request("PUT", { ...data, priceCents: 8500000 }), ctx);
    await db.db.$disconnect();
    const rows = await history();
    expect(rows).toMatchObject([
      { priceCents: 9000000 },
      { priceCents: 8500000, reason: "edited" },
    ]);
    expect(rows[1].id).toBeGreaterThan(rows[0].id);
    expect(
      (await item.PUT(request("PUT", { ...data, priceCents: -1 }), ctx)).status,
    ).toBe(400);
    expect(await history()).toHaveLength(2);
    expect((await (await item.GET(request("GET"), ctx)).json()).favorite).toBe(
      true,
    );
    await item.DELETE(request("DELETE"), ctx);
    expect((await prices.GET(request("GET"), ctx)).status).toBe(404);
    expect(await db.db.vehiclePrice.count({ where: { vehicleId: v.id } })).toBe(
      0,
    );
  });
  it("rolls back a price update when its history cannot be written", async () => {
    const { vehicleRepository } = await import("../src/lib/repository");
    const v = await vehicleRepository.create(data);
    try {
      await db.db.$executeRawUnsafe(
        `CREATE TRIGGER reject_price_history BEFORE INSERT ON VehiclePrice BEGIN SELECT RAISE(ABORT, 'test history failure'); END`,
      );
      await expect(
        vehicleRepository.update(v.id, { ...data, priceCents: 8000000 }),
      ).rejects.toThrow();
      expect((await vehicleRepository.find(v.id))?.priceCents).toBe(
        data.priceCents,
      );
      expect(await vehicleRepository.priceHistory(v.id)).toHaveLength(1);
    } finally {
      await db.db.$executeRawUnsafe(
        "DROP TRIGGER IF EXISTS reject_price_history",
      );
      await vehicleRepository.delete(v.id);
    }
  });
  it("rejects invalid input and cross-origin mutation", async () => {
    expect(
      (await collection.POST(request("POST", { ...data, priceCents: -1 })))
        .status,
    ).toBe(400);
    expect(
      (await collection.POST(request("POST", data, "https://other.example")))
        .status,
    ).toBe(403);
    expect(
      (
        await collection.POST(
          new Request("http://localhost:3000/api/vehicles", {
            method: "POST",
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(await (await collection.GET()).json()).toEqual([]);
  });
});
