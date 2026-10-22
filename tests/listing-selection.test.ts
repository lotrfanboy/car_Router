import { expect, it } from "vitest";
import { reconcileListingSelection, toggleListingSelection } from "../src/lib/listing-selection";

it("keeps stable source IDs, enforces four, and permits removal", () => {
  const listings = [1, 2, 3, 4, 5].map((id) => ({ source: "olx" as const, externalId: String(id) }));
  const selected = listings.slice(0, 4).reduce<string[]>((keys, row) => toggleListingSelection(keys, row), []);
  expect(selected).toEqual(["olx:1", "olx:2", "olx:3", "olx:4"]);
  expect(toggleListingSelection(selected, listings[4])).toEqual(selected);
  expect(toggleListingSelection(selected, listings[1])).toEqual(["olx:1", "olx:3", "olx:4"]);
});

it("releases comparison slots when listings were unsaved elsewhere before reloading", () => {
  const stored = ["olx:1", "olx:2", "olx:3", "olx:4"];
  const available = [
    { source: "olx" as const, externalId: "2" },
    { source: "webmotors" as const, externalId: "1" },
  ];
  const selected = reconcileListingSelection(stored, available);
  expect(selected).toEqual(["olx:2"]);
  expect(toggleListingSelection(selected, available[1])).toEqual(["olx:2", "webmotors:1"]);
  expect(reconcileListingSelection(stored, [])).toEqual([]);
});

it("keeps selection order and unique source IDs when reconciling saved listings", () => {
  const available = [1, 2, 3, 4, 5].map((id) => ({ source: "olx" as const, externalId: String(id) }));
  expect(reconcileListingSelection(["olx:3", "olx:3", "olx:1", "olx:5", "olx:2", "olx:4"], available))
    .toEqual(["olx:3", "olx:1", "olx:5", "olx:2"]);
});
