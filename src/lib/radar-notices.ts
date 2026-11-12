import { commercialListing } from "./commercial-models";
import {
  eligibility,
  listingMatchStatus,
  type Listing,
  type SearchCriteria,
} from "./discovery";
import type { VehicleCatalog } from "./vehicle-catalog";

/** Current classification on read; the original notice and payload stay immutable. */
export function currentRadarNotice<
  T extends { payload: string | null; matchStatus: string },
>(notice: T, criteria: SearchCriteria, catalog: VehicleCatalog) {
  let listing: Listing | null = null;
  try {
    listing = notice.payload ? (JSON.parse(notice.payload) as Listing) : null;
    if (listing) {
      listing = commercialListing(catalog, listing);
      listing = { ...listing, reasons: eligibility(listing, criteria) };
    }
  } catch {
    listing = null;
  }
  const matchStatus = listing
    ? listingMatchStatus(listing, criteria)
    : "uncertain";
  if (matchStatus === "incompatible") return null;
  return {
    ...notice,
    payload: undefined,
    listing,
    recordedMatchStatus: notice.matchStatus,
    matchStatus,
  };
}
