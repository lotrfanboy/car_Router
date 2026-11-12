import { describe, it, expect } from "vitest";
import {
  parseMoneyInput,
  moneyInput,
  parseMileageInput,
  mileageInput,
} from "../src/lib/manual-form-values";
import { vehicleSchema } from "../src/lib/vehicle";
describe("Brazilian manual amounts", () => {
  it("reads reais, decimals and grouping without losing cents", () => {
    expect(parseMoneyInput("125000")).toBe(12500000);
    expect(parseMoneyInput("125.000,50")).toBe(12500050);
    expect(parseMoneyInput("R$ 125.000,50")).toBe(12500050);
    expect(parseMoneyInput("125000.50")).toBe(12500050);
    expect(moneyInput(12500050)).toBe("125.000,50");
  });
  it("rejects exponent, negative, malformed and excess decimal input", () => {
    for (const s of ["1e5", "-100", "12,345", "1.2.3", "", "R$abc"]) {
      expect(Number.isNaN(parseMoneyInput(s))).toBe(true);
    }
  });
  it("keeps mileage integer and readable", () => {
    expect(parseMileageInput("100.000")).toBe(100000);
    expect(mileageInput("100000")).toBe("100.000");
    for (const s of ["1,5", "1e5", "-5", "1.23"]) {
      expect(Number.isNaN(parseMileageInput(s))).toBe(true);
    }
  });
  it("defaults missing manual origin while preserving explicit origin and validating photos", () => {
    const row = {
      brand: "BMW",
      model: "320i",
      manufactureYear: 2016,
      modelYear: 2016,
      mileage: 100000,
      priceCents: 12500000,
    };
    expect(vehicleSchema.parse(row).source).toBe("Cadastro manual");
    expect(vehicleSchema.parse({ ...row, source: "Indicação" }).source).toBe(
      "Indicação",
    );
    expect(
      vehicleSchema.safeParse({ ...row, imageUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      vehicleSchema.safeParse({
        ...row,
        imageUrl:
          "/api/vehicle-images/12345678-1234-1234-1234-123456789abc.png",
      }).success,
    ).toBe(true);
    expect(
      vehicleSchema.safeParse({
        ...row,
        imageUrl: "/api/vehicle-images/../../secret",
      }).success,
    ).toBe(false);
  });
});
