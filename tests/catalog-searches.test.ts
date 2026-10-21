import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const folder = mkdtempSync(
  path.join(process.env.RADAR_TEST_ROOT!, "catalog-searches-"),
);
process.env.DATABASE_URL =
  "file:" + path.join(folder, "test.db").replaceAll("\\", "/");

let collection: typeof import("../src/app/api/catalog-searches/route");
let item: typeof import("../src/app/api/catalog-searches/[id]/route");
let db: typeof import("../src/lib/db");
const network = vi.fn(() => {
  throw new Error("Catalog filters must not invoke external providers");
});
const request = (
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request("http://localhost:3000/api/catalog-searches", {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const input = {
  name: "Corolla até R$ 100 mil",
  query: "brand=Toyota&model=Corolla&priceMax=100000&state=SP&favorite=true",
};
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  collection = await import("../src/app/api/catalog-searches/route");
  item = await import("../src/app/api/catalog-searches/[id]/route");
  db = await import("../src/lib/db");
}, 30000);

beforeEach(async () => {
  await db.db.catalogSearch.deleteMany();
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await db?.db.$disconnect();
});

describe("local catalog filters with isolated SQLite and actual migrations", () => {
  it("saves, reloads after reconnecting, and removes without running provider searches", async () => {
    expect(await (await collection.GET()).json()).toEqual([]);
    const response = await collection.POST(request("POST", input));
    expect(response.status).toBe(201);
    const saved = await response.json();
    expect(saved).toMatchObject(input);
    expect(typeof saved.id).toBe("string");
    expect(Number.isFinite(Date.parse(saved.createdAt))).toBe(true);
    await db.db.$disconnect();
    expect(await (await collection.GET()).json()).toEqual([saved]);
    expect(await db.db.savedSearch.count()).toBe(0);
    expect(await db.db.searchRun.count()).toBe(0);
    expect(await db.db.providerSpend.count()).toBe(0);
    expect(
      (await item.DELETE(request("DELETE"), context(saved.id))).status,
    ).toBe(200);
    expect(await (await collection.GET()).json()).toEqual([]);
    expect(
      (await item.DELETE(request("DELETE"), context(saved.id))).status,
    ).toBe(404);
  });

  it("normalizes empty filters and preserves encoded accents and all supported filter categories", async () => {
    const query = new URLSearchParams({
      q: "São Paulo",
      brand: "Toyota",
      model: "Corolla",
      version: "XEi",
      city: "São Paulo",
      source: "Cadastro manual",
      state: "SP",
      yearMin: "2020",
      yearMax: "2023",
      manufactureYear: "2020",
      priceMin: "90000.50",
      priceMax: "120000",
      mileageMax: "70000",
      days: "30",
      referenceDiscountMin: "5.50",
      favorite: "false",
      exactMatch: "true",
      reduced: "true",
      sort: "opportunity",
      classification: "opportunities",
      fuel: "",
    }).toString();
    const response = await collection.POST(
      request("POST", { name: "  Filtros completos  ", query }),
    );
    expect(response.status).toBe(201);
    const saved = await response.json();
    expect(saved.name).toBe("Filtros completos");
    const restored = new URLSearchParams(saved.query);
    expect(restored.get("q")).toBe("São Paulo");
    expect(restored.get("priceMin")).toBe("90000.50");
    expect(restored.get("favorite")).toBe("false");
    expect(restored.get("exactMatch")).toBe("true");
    await db.db.$disconnect();
    const reloaded = await (await collection.GET()).json();
    expect(new URLSearchParams(reloaded[0].query).get("exactMatch")).toBe(
      "true",
    );
    expect(restored.has("fuel")).toBe(false);
  });

  it.each([
    "redirect=https%3A%2F%2Fexample.com",
    "brand=Toyota&brand=Honda",
    "yearMin=2023&yearMax=2020",
    "priceMin=120000&priceMax=100000",
    "priceMin=-1",
    "priceMax=Infinity",
    "yearMin=2020.5",
    "mileageMax=1.5",
    "referenceDiscountMin=101",
    "days=0",
    "state=XX",
    "sort=random",
    "favorite=yes",
    "exactMatch=1",
    "classification=guaranteed-profit",
    "/radar?brand=Toyota",
    "https://example.com/radar?brand=Toyota",
    "javascript:alert(1)",
    "?brand=Toyota",
    "q=test%00value",
    "q=" + "a".repeat(2048),
  ])("rejects unsafe or inconsistent filters: %s", async (query) => {
    const response = await collection.POST(
      request("POST", { name: "Inválida", query }),
    );
    expect(response.status).toBe(400);
    expect(await (await collection.GET()).json()).toEqual([]);
  });

  it("validates names, rejects unexpected body keys and malformed JSON", async () => {
    for (const body of [
      { ...input, name: " " },
      { ...input, name: "a".repeat(81) },
      { ...input, runProvider: true },
      { ...input, query: null },
    ]) {
      expect((await collection.POST(request("POST", body))).status).toBe(400);
    }
    const malformed = new Request(
      "http://localhost:3000/api/catalog-searches",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      },
    );
    expect((await collection.POST(malformed)).status).toBe(400);
    expect(await db.db.catalogSearch.count()).toBe(0);
  });

  it("rejects wrong content type and oversized declared or streamed bodies", async () => {
    expect(
      (
        await collection.POST(
          request("POST", input, { "content-type": "text/plain" }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await collection.POST(
          request("POST", input, { "content-length": "16385" }),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await collection.POST(
          request("POST", { ...input, name: "a".repeat(16385) }),
        )
      ).status,
    ).toBe(413);
    expect(await db.db.catalogSearch.count()).toBe(0);
  });

  it("rejects cross-origin creation and deletion without changing saved data", async () => {
    const hostileHeaders: Record<string, string>[] = [
      { origin: "https://unrelated.example" },
      { "sec-fetch-site": "cross-site" },
    ];
    for (const headers of hostileHeaders) {
      expect(
        (await collection.POST(request("POST", input, headers))).status,
      ).toBe(403);
    }
    const saved = await (await collection.POST(request("POST", input))).json();
    expect(
      (
        await item.DELETE(
          request("DELETE", undefined, { origin: "https://unrelated.example" }),
          context(saved.id),
        )
      ).status,
    ).toBe(403);
    expect(await (await collection.GET()).json()).toEqual([saved]);
  });

  it("limits local filters to 30 and frees capacity when a filter is removed", async () => {
    for (let index = 0; index < 30; index++) {
      expect(
        (
          await collection.POST(
            request("POST", { ...input, name: `Busca ${index + 1}` }),
          )
        ).status,
      ).toBe(201);
    }
    expect((await collection.POST(request("POST", input))).status).toBe(409);
    const rows = await (await collection.GET()).json();
    expect(rows).toHaveLength(30);
    await item.DELETE(request("DELETE"), context(rows[0].id));
    expect((await collection.POST(request("POST", input))).status).toBe(201);
    expect(await db.db.catalogSearch.count()).toBe(30);
    expect(await db.db.providerSpend.count()).toBe(0);
  });
});
