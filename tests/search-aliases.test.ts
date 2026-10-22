import { expect, it } from "vitest";
import { canonicalBrand, canonicalModel } from "../src/lib/discovery";

it("normalizes spelling without manufacturer-specific aliases or model rules", () => {
  expect(canonicalBrand("Audi")).toBe(canonicalBrand("AUDI"));
  expect(canonicalBrand("Mercedes")).not.toBe(canonicalBrand("Mercedes-Benz"));
  expect(canonicalModel("AB-245 Edition")).toBe(
    canonicalModel("AB245 Edition"),
  );
  expect(canonicalModel("C-180 Avantgarde")).toBe(
    canonicalModel("C180 Avantgarde"),
  );
  expect(canonicalModel("C180 Avantgarde")).not.toBe(
    canonicalModel("C180 Exclusive"),
  );
  expect(canonicalModel("Corolla")).not.toBe(canonicalModel("Corolla Cross"));
});
