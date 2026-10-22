import { listingKey } from "./listing-comparison";
import type { Listing } from "./discovery";

const storageKey = "car-router-listing-comparison";
export function readListingSelection(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((key): key is string => typeof key === "string"))].slice(0, 4)
      : [];
  } catch {
    return [];
  }
}
export function reconcileListingSelection(
  keys: string[],
  listings: Pick<Listing, "source" | "externalId">[],
) {
  const available = new Set(listings.map(listingKey));
  return [...new Set(keys)].filter((key) => available.has(key)).slice(0, 4);
}
export function writeListingSelection(keys: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...new Set(keys)].slice(0, 4)));
  } catch {
    // Selection still works until the page is closed when storage is disabled.
  }
}
export function toggleListingSelection(keys: string[], listing: Pick<Listing, "source" | "externalId">) {
  const key = listingKey(listing);
  if (keys.includes(key)) return keys.filter((item) => item !== key);
  return keys.length < 4 ? [...keys, key] : keys;
}
