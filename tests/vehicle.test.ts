import { describe, it, expect } from "vitest";
import {
  vehicleSchema,
  opportunity,
  filterVehicles,
  defaultFilters,
  Vehicle,
} from "../src/lib/vehicle";
const input = {
  brand: "Toyota",
  model: "Corolla",
  manufactureYear: 2020,
  modelYear: 2021,
  mileage: 50000,
  priceCents: 9000000,
  referenceCents: 10000000,
  source: "Particular",
  city: "São Paulo",
  state: "SP",
};
function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    ...vehicleSchema.parse(input),
    id: "a",
    favorite: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
describe("validation", () => {
  it("normalizes text and optional fields", () => {
    expect(
      vehicleSchema.parse({ ...input, brand: " Toyota ", notes: " " }).notes,
    ).toBeNull();
    expect(vehicleSchema.parse(input).brand).toBe("Toyota");
  });
  it.each([
    { priceCents: 0 },
    { referenceCents: 0 },
    { priceCents: 1.1 },
    { mileage: -1 },
    { modelYear: 2019 },
    { brand: " " },
    { state: "XX" },
    { originalUrl: "javascript:alert(1)" },
    { imageUrl: "file:///etc/passwd" },
    { fuel: "inventado" },
  ])("rejects invalid data %j", (value) => {
    expect(vehicleSchema.safeParse({ ...input, ...value }).success).toBe(false);
  });
  it("permits valid http urls and missing reference", () => {
    expect(
      vehicleSchema.safeParse({
        ...input,
        referenceCents: null,
        imageUrl: "https://example.com/car.jpg",
      }).success,
    ).toBe(true);
  });
  it("keeps the legacy source while storing seller type separately", () => {
    expect(
      vehicleSchema.parse({
        ...input,
        source: "OLX - texto legado",
        sellerType: "Particular",
      }),
    ).toMatchObject({
      source: "OLX - texto legado",
      sellerType: "Particular",
    });
    expect(vehicleSchema.parse(input).sellerType).toBeNull();
  });
});
describe("reference calculation", () => {
  it("calculates exact negative difference", () => {
    expect(opportunity(9000000, 10000000)).toEqual({
      difference: -1000000,
      percentage: -10,
    });
  });
  it("handles above, equal, absent and zero reference", () => {
    expect(opportunity(11000, 10000)?.percentage).toBe(10);
    expect(opportunity(100, 100)?.percentage).toBe(0);
    expect(opportunity(100, null)).toBeNull();
    expect(opportunity(100, 0)).toBeNull();
  });
});
describe("catalog filtering", () => {
  const rows = [
    vehicle(),
    vehicle({
      id: "b",
      brand: "Honda",
      model: "Civic",
      priceCents: 12000000,
      mileage: 20000,
      modelYear: 2022,
      favorite: true,
      city: "Curitiba",
      state: "PR",
      source: "Loja",
      createdAt: "2026-02-01T00:00:00Z",
    }),
  ];
  it("combines all filters and ignores accents", () => {
    expect(
      filterVehicles(rows, {
        ...defaultFilters,
        q: "sao",
        brand: "toy",
        model: "cor",
        yearMin: "2020",
        yearMax: "2021",
        priceMin: "85000",
        priceMax: "95000",
        mileageMax: "50000",
        state: "SP",
        city: "São",
        source: "part",
      }).map((v) => v.id),
    ).toEqual(["a"]);
  });
  it("filters favorites, missing matches and boundaries", () => {
    expect(
      filterVehicles(rows, { ...defaultFilters, favorite: true }).map(
        (v) => v.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterVehicles(rows, { ...defaultFilters, priceMax: "89999" }),
    ).toHaveLength(0);
    expect(
      filterVehicles(rows, { ...defaultFilters, mileageMax: "19999" }),
    ).toHaveLength(0);
    expect(
      filterVehicles(rows, { ...defaultFilters, yearMin: "2023" }),
    ).toHaveLength(0);
  });
  it.each([
    ["priceAsc", "a"],
    ["priceDesc", "b"],
    ["mileage", "b"],
    ["year", "b"],
    ["recent", "b"],
  ])("sorts %s", (sort, id) => {
    expect(filterVehicles(rows, { ...defaultFilters, sort })[0].id).toBe(id);
  });
});
