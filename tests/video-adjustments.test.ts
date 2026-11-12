import { afterEach, describe, expect, it, vi } from "vitest";
import { fipePath, fipeOptions, fipeReference } from "../src/lib/fipe";
import { overviewMonth, overviewActivity } from "../src/lib/workspace-overview";
import { vehicleImageOrigin } from "../src/lib/vehicle-image-origin";
import {
  searchSchema,
  listingMatchStatus,
  type Listing,
} from "../src/lib/discovery";
const reference = {
  valor: "R$ 125.000,50",
  marca: "QA",
  modelo: "MODELO TESTE",
  anoModelo: 2018,
  combustivel: "Gasolina",
  codigoFipe: "123456-7",
  mesReferencia: "novembro de 2026",
};
afterEach(() => vi.unstubAllGlobals());
describe("FIPE explicit reference", () => {
  it("limits paths to supported car endpoints and rejects injection", () => {
    expect(fipePath({ type: "brands" })).toBe("marcas/v1/carros");
    expect(
      fipePath({ type: "detail", brand: "6", model: "123", year: "2018-1" }),
    ).toBe("detalhes/v1/carros/6/123/2018-1");
    expect(fipePath({ type: "models", brand: "../secrets" })).toBeNull();
    expect(
      fipePath({ type: "detail", brand: "6", model: "123", year: "2018-1?x" }),
    ).toBeNull();
  });
  it("reads the actual provider field variants and retains monthly provenance", () => {
    expect(fipeOptions([{ modelo: "QA modelo", valor: "123" }])).toEqual([
      { name: "QA modelo", code: "123" },
    ]);
    expect(
      fipeOptions([{ nome: "2018 Gasolina", valor: "2018-1" }], true),
    ).toHaveLength(1);
    expect(fipeReference(reference)).toMatchObject({
      priceCents: 12500050,
      referenceMonth: "novembro de 2026",
      code: "123456-7",
      modelYear: 2018,
    });
    expect(() =>
      fipeReference({ ...reference, valor: "indisponível" }),
    ).toThrow();
  });
  it("returns an unavailable local base without calling a provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const { GET } = await import("../src/app/api/fipe/route");
    const { NextRequest } = await import("next/server");
    const r = await GET(
      new NextRequest("http://localhost/api/fipe?type=brands"),
    );
    expect(r.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(await r.json()).not.toHaveProperty("reference");
  });
});
it("counts only stored dates in the current UTC month through now", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  expect(overviewMonth(now).start.toISOString()).toBe(
    "2026-11-01T00:00:00.000Z",
  );
  const a = overviewActivity(
    [
      "2026-10-31T23:59:59Z",
      "2026-11-01T00:00:00Z",
      "2026-11-04T12:00:00Z",
      "2026-11-04T12:00:01Z",
      "2026-12-01T00:00:00Z",
    ].map((d) => ({ createdAt: new Date(d) })),
    now,
  );
  expect(a.count).toBe(2);
  expect(a.buckets[0].count).toBe(2);
  expect(a.buckets.at(-1)?.label).toBe("29–30");
});
it("renders uploaded relative images and tolerates legacy invalid URLs", () => {
  expect(
    vehicleImageOrigin(
      "/api/vehicle-images/56c3d0e6-8d04-4419-8723-334b66a85e62.png",
    ),
  ).toContain("computador");
  expect(vehicleImageOrigin("https://example.com/foto.png")).toContain(
    "example.com",
  );
  expect(() => vehicleImageOrigin("malformed url")).not.toThrow();
});
it("enforces both km boundaries and preserves unknown km as uncertain", () => {
  const c = searchSchema.parse({
    name: "QA",
    brand: "Toyota",
    model: "Corolla",
    state: "PR",
    locationMode: "state",
    yearMin: null,
    yearMax: null,
    mileageMin: 20000,
    mileageMax: 60000,
    priceMax: 120000,
    privateOnly: false,
    sources: ["olx"],
  });
  const l = {
    source: "olx",
    brand: "Toyota",
    model: "Corolla",
    state: "PR",
    city: null,
    modelYear: 2020,
    mileage: 20000,
    priceCents: 10000000,
    sellerType: "unknown",
  } as Listing;
  expect(listingMatchStatus(l, c)).toBe("confirmed");
  expect(listingMatchStatus({ ...l, mileage: 19999 }, c)).toBe("incompatible");
  expect(listingMatchStatus({ ...l, mileage: 60001 }, c)).toBe("incompatible");
  expect(listingMatchStatus({ ...l, mileage: null }, c)).toBe("uncertain");
  expect(searchSchema.safeParse({ ...c, mileageMin: 60001 }).success).toBe(
    false,
  );
});
