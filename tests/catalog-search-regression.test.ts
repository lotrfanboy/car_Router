import { afterEach, beforeEach, expect, it, vi } from "vitest";
import failedSearch from "./fixtures/failed-catalog-search.json";
import { readVehicleCatalog } from "../src/lib/catalog-store";
import { fetchSource } from "../src/lib/discovery-providers";
import { searchSchema, type Source } from "../src/lib/discovery";
import { catalogSchema } from "../src/lib/vehicle-catalog";

vi.mock("../src/lib/catalog-store", () => ({ readVehicleCatalog: vi.fn() }));
vi.mock("../src/lib/db", () => ({
  db: { olxLocation: { findUnique: vi.fn(), upsert: vi.fn() } },
}));

let listings: unknown[] = [];
const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
  async (url) => {
    if (url === "https://api.geckoapi.com.br/v1/me/credits")
      return Response.json({ planId: "free", currentCredits: 80 });
    if (url === "https://api.geckoapi.com.br/v1/mcp")
      return Response.json({
        result: {
          tools: [
            { name: "olx_com_br_plp", description: "Current cost: 1 credit." },
          ],
        },
      });
    if (url === "https://api.geckoapi.com.br/v1/extract")
      return Response.json({
        data: { items: listings, totalResults: listings.length },
      });
    if (url === "https://api.reefapi.com/webmotors/v1/search")
      return Response.json({
        ok: true,
        data: {
          listings,
          total_results: listings.length,
          has_more: false,
        },
      });
    throw new Error(`Unexpected mocked provider request: ${url}`);
  },
);

beforeEach(() => {
  listings = [];
  vi.clearAllMocks();
  vi.mocked(readVehicleCatalog).mockResolvedValue(
    catalogSchema.parse(failedSearch.catalog),
  );
  vi.stubEnv("GECKO_API_KEY", "test-only-no-real-key");
  vi.stubEnv("REEF_API_KEY", "test-only-no-real-key");
  vi.stubEnv("REEF_FREE_TRIAL", "true");
  // Every request is intercepted, including account and cost checks.
  vi.stubGlobal("fetch", fetcher);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sources: Source[] = ["olx", "webmotors"];
it.each(sources)(
  "replays the saved AUDI A4 / PR failure through %s without requiring a crosswalk",
  async (source) => {
    const criteria = searchSchema.parse(failedSearch.criteria);
    const before = structuredClone(criteria);
    const reserve = vi.fn(async () => {});
    const recorded = failedSearch.result.sources.find(
      (item) => item.source === source,
    );
    expect(recorded).toMatchObject({
      status: "error",
      creditsReserved: 0,
      listings: [],
    });
    expect(recorded?.message).toContain("sem correspondência confirmada");

    const result = await fetchSource(source, criteria, reserve);

    expect(result).toMatchObject({
      status: "ok",
      received: 0,
      total: 0,
      partial: false,
      listings: [],
      applied: { mapping: { status: "uncertain" } },
    });
    expect(criteria).toEqual(before);
    expect(reserve).toHaveBeenCalledExactlyOnceWith(
      source === "olx" ? "gecko" : "reef",
      source === "olx" ? 1 : 2,
    );

    const collect = fetcher.mock.calls.find(([url]) =>
      url.endsWith(source === "olx" ? "/extract" : "/search"),
    );
    expect(collect).toBeDefined();
    const payload = JSON.parse(String(collect![1]?.body));
    if (source === "olx") {
      expect(payload).toEqual({
        target: "olx.com.br",
        type: "plp",
        url: expect.any(String),
      });
      const url = new URL(payload.url);
      expect(url.pathname).toBe(
        "/autos-e-pecas/carros-vans-e-utilitarios/estado-pr",
      );
      expect(url.searchParams.get("q")).toBe("AUDI A4");
      expect(fetcher).toHaveBeenCalledTimes(3);
    } else {
      expect(payload).toEqual({
        make: "AUDI",
        model: "A4",
        location: "pr",
        page: 1,
        page_size: 24,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    // Canonical IDs are provenance, never invented source filter IDs.
    expect(JSON.stringify(payload)).not.toContain(criteria.catalog!.brandCode);
    expect(JSON.stringify(payload)).not.toContain(criteria.catalog!.modelCode);
  },
);

it.each(sources)(
  "does not turn matching text without a crosswalk into an exact %s result",
  async (source) => {
    // Synthetic responses exercise the adapter; these are not live listings.
    listings = [
      source === "olx"
        ? {
            id: "synthetic-audi",
            url: "https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/synthetic-audi",
            title: "AUDI A4",
            price: 90000,
            location: { city: "Curitiba", state: "PR" },
            properties: [
              { name: "vehicle_brand", value: "AUDI" },
              { name: "vehicle_model", value: "A4" },
              { name: "regdate", value: "2018" },
            ],
          }
        : {
            listing_id: 1,
            url: "https://www.webmotors.com.br/comprar/audi/a4/synthetic/1",
            make: "AUDI",
            model: "A4",
            title: "AUDI A4",
            year_model: 2018,
            price: 90000,
            seller: { city: "Curitiba", state_code: "PR" },
          },
    ];
    const result = await fetchSource(
      source,
      searchSchema.parse(failedSearch.criteria),
      vi.fn(async () => {}),
    );
    expect(result.status).toBe("ok");
    expect(result.listings).toHaveLength(1);
    const row = result.listings[0];
    expect(row.catalogResolution?.model).toBe("unresolved");
    expect(row.identity?.modelId).toBeUndefined();
    expect(row.reasons.length).toBeGreaterThan(0);
  },
);
