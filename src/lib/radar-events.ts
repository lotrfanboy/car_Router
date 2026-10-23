import { createHash } from "node:crypto";
import {
  listingMatchStatus,
  type Listing,
  type SearchCriteria,
} from "./discovery";

export type RadarEventKind =
  "baseline" | "new_listing" | "price_drop" | "discount";
export type RadarMatch = "confirmed" | "uncertain";
export function radarEventKey(
  radarId: string,
  searchId: string,
  key: string,
  priceCents: number,
) {
  return createHash("sha256")
    .update(`${radarId}:${searchId}:${key}:${priceCents}`)
    .digest("hex");
}
/** A newly observed ID is new to this radar, never proof of publication time. */
export function radarEvent(
  row: Listing,
  criteria: SearchCriteria,
  options: {
    mode: string;
    minPercent: number;
    initialized: boolean;
    previous?: { priceCents: number | null } | null;
  },
): { kind: RadarEventKind; matchStatus: RadarMatch } | null {
  const matchStatus = listingMatchStatus(row, criteria);
  if (
    matchStatus === "incompatible" ||
    row.priceCents === null ||
    row.priceCents <= 0
  )
    return null;
  if (!options.initialized) return { kind: "baseline", matchStatus };
  if (options.mode === "discount")
    return matchStatus === "confirmed" &&
      row.comparison?.status === "valid" &&
      row.comparison.belowPercent !== null &&
      row.comparison.belowPercent >= options.minPercent
      ? { kind: "discount", matchStatus }
      : null;
  if (!options.previous) return { kind: "new_listing", matchStatus };
  const previousPrice = options.previous.priceCents;
  if (
    previousPrice !== null &&
    previousPrice > 0 &&
    row.priceCents <= previousPrice * 0.99
  )
    return { kind: "price_drop", matchStatus };
  return null;
}
