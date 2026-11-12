import { expect, it } from "vitest";
import fixture from "./fixtures/catalog-resolver-observations.json";
import {
  catalogSchema,
  resolveCatalogVehicle,
} from "../src/lib/vehicle-catalog";

const catalog = () => catalogSchema.parse(structuredClone(fixture.catalog));
const source = {
  source: "olx" as const,
  brand: fixture.observations.confirmed.brand,
  model: fixture.observations.confirmed.model,
};
it("does not confirm a full label with conflicting positive and negative reviews", () => {
  const data = catalog(),
    positive = data.mappings.find(
      (m) => m.status === "confirmed" && m.level === "model",
    )!;
  data.mappings.push({
    ...positive,
    id: "offline-conflicting-negative",
    status: "divergent",
    canonicalModelId: null,
    notCanonicalModelId: positive.canonicalModelId,
  });
  const result = resolveCatalogVehicle(catalogSchema.parse(data), source);
  expect(result.classification.model).toBe("ambiguous");
  expect(result.identity?.modelId).toBeUndefined();
  expect(result.identity?.versionId).toBeUndefined();
});
it("keeps a positive label in review when a matching review is pending or ambiguous", () => {
  for (const status of ["pending", "ambiguous"] as const) {
    const data = catalog(),
      positive = data.mappings.find(
        (m) => m.status === "confirmed" && m.level === "model",
      )!;
    data.mappings.push({ ...positive, id: `offline-review-${status}`, status });
    const result = resolveCatalogVehicle(catalogSchema.parse(data), source);
    expect(result.classification.model).toBe("ambiguous");
    expect(result.identity?.modelId).toBeUndefined();
  }
});
it("preserves a consistent positive review when a different family is explicitly excluded", () => {
  const data = catalog(),
    positive = data.mappings.find(
      (m) => m.status === "confirmed" && m.level === "model",
    )!;
  data.models.push({
    ...data.models[0],
    id: "offline-other-model",
    name: "Other family",
    references: [],
  });
  data.mappings.push({
    ...positive,
    id: "offline-unrelated-negative",
    status: "divergent",
    canonicalModelId: null,
    notCanonicalModelId: "offline-other-model",
  });
  const result = resolveCatalogVehicle(catalogSchema.parse(data), source);
  expect(result.classification.model).toBe("confirmed");
  expect(result.identity?.modelId).toBe(positive.canonicalModelId);
});
