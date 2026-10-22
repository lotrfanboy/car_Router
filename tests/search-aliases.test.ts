import { expect, it } from "vitest";
import { canonicalBrand, canonicalModel } from "../src/lib/discovery";

it("matches verified spelling aliases without merging different models", () => {
  expect(canonicalBrand("Audi")).toBe(canonicalBrand("AUDI"));
  expect(canonicalBrand("Mercedes")).toBe(canonicalBrand("Mercedes-Benz"));
  expect(canonicalModel("C-180 Avantgarde")).toBe(canonicalModel("C180 Avantgarde"));
  expect(canonicalModel("C180 Avantgarde")).not.toBe(canonicalModel("C180 Exclusive"));
  expect(canonicalModel("Corolla")).not.toBe(canonicalModel("Corolla Cross"));
});
