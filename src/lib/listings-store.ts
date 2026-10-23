import { db } from "./db";
import { type Listing, type SearchResult } from "./discovery";
import {
  compareListing,
  COMPARISON_RULES,
  listingKey,
} from "./listing-comparison";

export async function referenceUniverse() {
  const records = await db.discoveredListing.findMany({
    where: {
      lastSeen: {
        gte: new Date(Date.now() - COMPARISON_RULES.maxAgeDays * 86400000),
      },
    },
    orderBy: { lastSeen: "desc" },
    take: 5000,
  });
  return records.map(
    (row) => ({ ...JSON.parse(row.payload), saved: !!row.savedAt }) as Listing,
  );
}
export async function enrichResult<T extends SearchResult>(
  result: T,
): Promise<T> {
  const universe = await referenceUniverse();
  const latest = new Map(universe.map((row) => [listingKey(row), row]));
  return {
    ...result,
    sources: result.sources.map((source) => ({
      ...source,
      listings: source.listings.map((row) => ({
        ...row,
        saved: latest.get(listingKey(row))?.saved ?? false,
        comparison: compareListing(row, universe),
      })),
    })),
  };
}
export async function getListing(source: string, externalId: string) {
  const record = await db.discoveredListing.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  if (!record) return null;
  const listing: Listing = JSON.parse(record.payload);
  return {
    ...listing,
    saved: !!record.savedAt,
    comparison: compareListing(listing, await referenceUniverse()),
  };
}
export async function savedListings() {
  const [records, universe] = await Promise.all([
    db.discoveredListing.findMany({
      where: { savedAt: { not: null } },
      orderBy: { savedAt: "desc" },
    }),
    referenceUniverse(),
  ]);
  return records.map((row) => {
    const listing: Listing = JSON.parse(row.payload);
    return {
      ...listing,
      saved: true,
      comparison: compareListing(listing, universe),
    };
  });
}
