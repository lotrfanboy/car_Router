import { describe, expect, it } from "vitest";
import {
  eligibility,
  listingMatchStatus,
  searchSchema,
  type Listing,
} from "../src/lib/discovery";
import { compareListing } from "../src/lib/listing-comparison";

const criteria = searchSchema.parse({
  name: "Classification fixture",
  brand: "Marca de teste",
  model: "Modelo de teste",
  version: "Versão de teste",
  state: "PR",
  cities: ["Curitiba", "Londrina"],
  locationMode: "cities",
  yearMin: 2020,
  yearMax: 2024,
  priceMax: 120000,
  mileageMax: 60000,
  privateOnly: true,
  sources: ["olx", "webmotors"],
  catalog: {
    provider: "carrouter",
    revision: "test",
    brandCode: "brand-1",
    brandName: "Marca de teste",
    modelCode: "model-1",
    modelName: "Modelo de teste",
    versionCode: "version-1",
    versionName: "Versão de teste",
  },
});
const listing: Listing = {
  source: "webmotors",
  externalId: "test",
  url: "https://www.webmotors.com.br/comprar/test/1",
  title: "Test only",
  brand: criteria.brand,
  model: criteria.model,
  version: criteria.version,
  identity: { brandId: "brand-1", modelId: "model-1", versionId: "version-1" },
  catalogResolution: { model: "confirmed", version: "confirmed" },
  modelYear: 2022,
  priceCents: 10000000,
  mileage: 10000,
  city: "Londrina",
  state: "PR",
  sellerType: "private",
  observedAt: new Date().toISOString(),
  reasons: [],
};

describe("confirmed, uncertain and incompatible matches", () => {
  it("does not compare different confirmed version identities with equal names", () => {
    const peers = Array.from({ length: 6 }, (_, i): Listing => ({
      ...listing,
      externalId: `other-version-${i}`,
      url: `https://www.webmotors.com.br/comprar/test/${i + 10}`,
      identity: { ...listing.identity!, versionId: "different-version" },
    }));
    expect(compareListing(listing, peers)).toMatchObject({
      status: "insufficient",
      count: 0,
    });
  });
  it("only confirms an evidenced identity satisfying every requested filter", () => {
    expect(listingMatchStatus(listing, criteria)).toBe("confirmed");
    const unresolved = {
      ...listing,
      identity: undefined,
      catalogResolution: {
        model: "unresolved" as const,
        version: "unresolved" as const,
      },
    };
    expect(listingMatchStatus(unresolved, criteria)).toBe("uncertain");
    expect(eligibility(unresolved, criteria)).toEqual([
      "Marca não classificada",
      "Modelo não classificado",
      "Versão não classificada",
    ]);
  });
  it.each(["pending", "ambiguous", "unresolved"] as const)(
    "keeps a %s version outside exact results",
    (version) => {
      const row = {
        ...listing,
        identity: { brandId: "brand-1", modelId: "model-1" },
        catalogResolution: { model: "confirmed" as const, version },
      };
      expect(listingMatchStatus(row, criteria)).toBe("uncertain");
      expect(compareListing(row, [])).toMatchObject({
        status: "insufficient",
        count: 0,
      });
      expect(compareListing(row, []).limitations.join(" ")).toContain(
        "ainda não confirmada",
      );
    },
  );
  it.each([
    { identity: { brandId: "brand-2" } },
    { identity: { brandId: "brand-1", modelId: "model-2" } },
    {
      identity: {
        brandId: "brand-1",
        modelId: "model-1",
        versionId: "version-2",
      },
    },
    {
      identity: undefined,
      catalogResolution: {
        model: "divergent" as const,
        version: "pending" as const,
        targetModelId: "model-1",
      },
    },
    { state: "SC" },
    { city: "Maringá" },
    { modelYear: 2019 },
    { modelYear: 2025 },
    { priceCents: 12000001 },
    { mileage: 60001 },
    { sellerType: "professional" as const },
  ])("gives a known conflict precedence over uncertain fields: %j", (patch) => {
    const row = { ...listing, ...patch };
    expect(listingMatchStatus(row, criteria)).toBe("incompatible");
    expect(eligibility(row, criteria).length).toBeGreaterThan(0);
  });
  it.each([
    { modelYear: null },
    { priceCents: null },
    { mileage: null },
    { state: null },
    { city: null },
    { sellerType: "unknown" as const },
  ])("does not call missing evidence incompatible: %j", (patch) => {
    expect(listingMatchStatus({ ...listing, ...patch }, criteria)).toBe(
      "uncertain",
    );
  });
  it("keeps either year boundary and multiple cities independent", () => {
    expect(
      listingMatchStatus(
        { ...listing, modelYear: 2026 },
        { ...criteria, yearMax: null },
      ),
    ).toBe("confirmed");
    expect(
      listingMatchStatus(
        { ...listing, modelYear: 2018 },
        { ...criteria, yearMin: null },
      ),
    ).toBe("confirmed");
    expect(listingMatchStatus({ ...listing, city: "Curitiba" }, criteria)).toBe(
      "confirmed",
    );
    expect(
      listingMatchStatus(
        { ...listing, city: "Maringá" },
        { ...criteria, locationMode: "state", cities: [], city: "" },
      ),
    ).toBe("confirmed");
  });
});
