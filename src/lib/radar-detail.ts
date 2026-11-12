import { db } from "./db";
import { listRadars } from "./radar";
import { listSearches } from "./discovery-store";
import {
  projectRadarOffers,
  type RadarDetail,
  type RadarView,
} from "./radar-presentation";
/** Read saved observations only. Never executes a collection or sends an alert. */
export async function getRadarDetail(id: string): Promise<RadarDetail | null> {
  const result = await listRadars();
  const row = result.radars.find((r) => r.id === id);
  if (!row) return null;
  const search = (await listSearches(row.searchId)).find(
    (s) => s.id === row.searchId,
  );
  const radar = JSON.parse(JSON.stringify(row)) as RadarView;
  const projected = projectRadarOffers(radar, search);
  const savedRows = await db.discoveredListing.findMany({
    where: { savedAt: { not: null } },
    select: { source: true, externalId: true },
  });
  const savedKeys = new Set(
    savedRows.map((listing) => `${listing.source}:${listing.externalId}`),
  );
  return {
    radar,
    ...projected,
    offers: projected.offers.map((offer) => ({
      ...offer,
      listing: {
        ...offer.listing,
        saved: savedKeys.has(
          `${offer.listing.source}:${offer.listing.externalId}`,
        ),
      },
    })),
    emailEnabled: result.infrastructure.email,
  };
}
