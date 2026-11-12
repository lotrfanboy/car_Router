import { expect, it } from "vitest";
import native from "../src/data/search-catalog.json";
import radars from "./fixtures/olx-local-radars.json";
import passat from "./fixtures/saved-passat-normalization.json";
import {
  mergeSearchCatalog,
  commercialListing,
  type NativeSearchCatalogSnapshot,
} from "../src/lib/commercial-models";
import { catalogSchema, emptyCatalog } from "../src/lib/vehicle-catalog";
import { searchSchema, type Listing } from "../src/lib/discovery";
import { candidateVersionFacets } from "../src/lib/result-facets";
const catalog = mergeSearchCatalog(
  catalogSchema.parse(emptyCatalog),
  native as NativeSearchCatalogSnapshot,
);
it.each(radars.groups)(
  "offers only the confirmed candidate versions for $name",
  (group) => {
    const rows = group.listings.map((l) =>
      commercialListing(catalog, l as Listing),
    );
    const choices = candidateVersionFacets(
      rows,
      searchSchema.parse(group.criteria),
    );
    expect(choices.reduce((sum, v) => sum + v.count, 0)).toBe(
      group.expected.confirmed,
    );
    if (group.criteria.brand === "AUDI")
      expect(choices.every((v) => !/^Q[3578]|^A[135678]/i.test(v.label))).toBe(
        true,
      );
    if (group.criteria.brand === "BMW")
      expect(choices.every((v) => !v.label.includes("GT Sport"))).toBe(true);
  },
);
it("does not advertise incompatible Passat/Nivus descriptions as candidate versions", () => {
  const rows = passat.sources.flatMap((s) =>
    s.listings.map((l) => commercialListing(catalog, l as Listing)),
  );
  const choices = candidateVersionFacets(
    rows,
    searchSchema.parse(passat.criteria),
  );
  expect(choices.reduce((sum, v) => sum + v.count, 0)).toBe(35);
  expect(choices.some((v) => v.label.includes("Nivus"))).toBe(false);
  expect(
    candidateVersionFacets([], searchSchema.parse(passat.criteria)),
  ).toEqual([]);
});
