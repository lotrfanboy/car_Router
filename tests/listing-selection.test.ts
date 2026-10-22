import { expect, it } from "vitest";
import { toggleListingSelection } from "../src/lib/listing-selection";

it("keeps stable source IDs, enforces four, and permits removal", () => {
  const listings = [1, 2, 3, 4, 5].map((id) => ({ source: "olx" as const, externalId: String(id) }));
  const selected = listings.slice(0, 4).reduce<string[]>((keys, row) => toggleListingSelection(keys, row), []);
  expect(selected).toEqual(["olx:1", "olx:2", "olx:3", "olx:4"]);
  expect(toggleListingSelection(selected, listings[4])).toEqual(selected);
  expect(toggleListingSelection(selected, listings[1])).toEqual(["olx:1", "olx:3", "olx:4"]);
});
