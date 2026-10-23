import { db } from "./db";
import {
  eligibility,
  type Listing,
  type SearchResult,
  type SearchCriteria,
} from "./discovery";
import { commercialListing } from "./commercial-models";
import { readVehicleCatalog } from "./catalog-store";
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
  const catalog = await readVehicleCatalog();
  return records.map((row) =>
    commercialListing(catalog, {
      ...JSON.parse(row.payload),
      saved: !!row.savedAt,
    } as Listing),
  );
}
export async function createEnrichmentContext() {
  const [universe, catalog] = await Promise.all([
    referenceUniverse(),
    readVehicleCatalog(),
  ]);
  return {
    universe,
    catalog,
    latest: new Map(universe.map((row) => [listingKey(row), row])),
  };
}
export type EnrichmentContext = Awaited<
  ReturnType<typeof createEnrichmentContext>
>;

export async function enrichResult<T extends SearchResult>(
  result: T,
  criteria?: SearchCriteria,
  context?: EnrichmentContext,
): Promise<T> {
  const { universe, catalog, latest } =
    context ?? (await createEnrichmentContext());
  return {
    ...result,
    sources: result.sources.map((source) => ({
      ...source,
      listings: source.listings.map((original) => {
        const row = commercialListing(catalog, original);
        return {
          ...row,
          saved: latest.get(listingKey(row))?.saved ?? false,
          comparison: compareListing(row, universe),
          ...(criteria &&
          (row.model !== original.model ||
            row.doors !== original.doors ||
            JSON.stringify(row.identity) !== JSON.stringify(original.identity))
            ? { reasons: eligibility(row, criteria) }
            : {}),
        };
      }),
    })),
  };
}
export async function getListing(source: string, externalId: string) {
  const record = await db.discoveredListing.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  if (!record) return null;
  const listing = commercialListing(
    await readVehicleCatalog(),
    JSON.parse(record.payload) as Listing,
  );
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
  const catalog = await readVehicleCatalog();
  return records.map((row) => {
    const listing = commercialListing(
      catalog,
      JSON.parse(row.payload) as Listing,
    );
    return {
      ...listing,
      saved: true,
      comparison: compareListing(listing, universe),
    };
  });
}
