import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import observations from "../src/data/olx-model-observations.json";
import native from "../src/data/search-catalog.json";
import fixture from "./fixtures/olx-local-radars.json";
import {
  mergeSearchCatalog,
  commercialListing,
  type NativeSearchCatalogSnapshot,
} from "../src/lib/commercial-models";
import {
  catalogSchema,
  emptyCatalog,
  resolveCatalogVehicle,
} from "../src/lib/vehicle-catalog";
import {
  eligibility,
  listingMatchStatus,
  searchSchema,
  type Listing,
} from "../src/lib/discovery";
import { radarEvent } from "../src/lib/radar-events";
import { currentRadarNotice } from "../src/lib/radar-notices";

const catalog = mergeSearchCatalog(
  catalogSchema.parse(emptyCatalog),
  native as NativeSearchCatalogSnapshot,
);
const row = (value: unknown) => commercialListing(catalog, value as Listing);

describe("saved OLX structured descriptions", () => {
  it.each(observations.observations)(
    "keeps evidenced identity $externalId exact and auditable",
    (record) => {
      const identity = {
        source: record.source,
        externalId: record.externalId,
        url: record.url,
        observed_at: record.observed_at,
        brand: record.brand,
        model: record.model,
        version: record.version,
        source_identity: record.source_identity,
      };
      expect(
        createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
      ).toBe(record.sha256);
      const result = resolveCatalogVehicle(catalog, {
        source: "olx",
        brand: record.brand,
        model: record.model,
        version: record.version,
        ...record.source_identity,
      });
      expect(result.classification.model).toBe(record.reviewStatus);
      expect(result.identity?.versionId).toBeUndefined();
      if (record.reviewStatus === "confirmed")
        expect(result.model?.name).toBe(record.commercialModel);
      else expect(result.identity?.modelId).toBeUndefined();
    },
  );

  it.each(fixture.groups)(
    "classifies all saved rows and filters of $name",
    (group) => {
      const criteria = searchSchema.parse(group.criteria);
      const totals = { confirmed: 0, uncertain: 0, incompatible: 0 };
      for (const original of group.listings) {
        const listing = row(original);
        const status = listingMatchStatus(listing, criteria);
        totals[status]++;
        expect(original.catalogResolution.model).toBe("unresolved");
        if (status === "confirmed") {
          expect(eligibility(listing, criteria)).toEqual([]);
          expect(listing.identity?.modelId).toBe(criteria.catalog?.modelCode);
          expect(listing.identity?.versionId).toBeUndefined();
        }
        if (status === "incompatible")
          expect(
            radarEvent(listing, criteria, {
              mode: "new_listings",
              minPercent: 0,
              initialized: true,
            }),
          ).toBeNull();
      }
      expect(totals).toEqual(group.expected);
    },
  );

  it("does not extrapolate a full reviewed label to an unseen description, title, brand or source ID", () => {
    const record = observations.observations.find(
      (o) => o.reviewStatus === "confirmed",
    )!;
    for (const changes of [
      { model: record.model + " UNKNOWN NEW DESCRIPTION" },
      { brand: "AUDI" },
      { brandId: "unreviewed-brand-id" },
      { modelId: "unreviewed-model-id" },
      { versionId: "unreviewed-version-id" },
    ])
      expect(
        resolveCatalogVehicle(catalog, {
          source: "olx",
          brand: record.brand,
          model: record.model,
          ...changes,
        }).identity?.modelId,
      ).toBeUndefined();
    const original = fixture.groups[0].listings[0];
    const titleOnly = row({
      ...original,
      title: "BMW 320i",
      original: { brand: "BMW", model: "Unknown model" },
      sourceModel: "Unknown model",
    });
    expect(
      listingMatchStatus(
        titleOnly,
        searchSchema.parse(fixture.groups[0].criteria),
      ),
    ).toBe("uncertain");
  });

  it("rejects state/year conflicts and keeps GT/K variants pending", () => {
    const criteria = searchSchema.parse(fixture.groups[0].criteria);
    const known = row(fixture.groups[0].listings[0]);
    expect(listingMatchStatus({ ...known, state: "PR" }, criteria)).toBe(
      "incompatible",
    );
    expect(listingMatchStatus({ ...known, modelYear: 2017 }, criteria)).toBe(
      "incompatible",
    );
    expect(listingMatchStatus({ ...known, modelYear: null }, criteria)).toBe(
      "uncertain",
    );
    const gt = fixture.groups[0].listings.find(
      (l) => l.sourceModel.includes(" GT ") && l.modelYear >= 2018,
    )!;
    expect(listingMatchStatus(row(gt), criteria)).toBe("uncertain");
    expect(row(gt).catalogResolution?.model).toBe("pending");
  });

  it("projects historical notices without changing their recorded evidence", () => {
    const group = fixture.groups[1],
      criteria = searchSchema.parse(group.criteria);
    const q3 = group.listings.find((l) => l.sourceModel.startsWith("Q3"))!;
    const a4 = group.listings.find(
      (l) => l.sourceModel.startsWith("A4") && l.modelYear >= 2016,
    )!;
    const notice = {
      payload: JSON.stringify(a4),
      matchStatus: "uncertain",
      id: "historical",
    };
    const before = structuredClone(notice);
    expect(currentRadarNotice(notice, criteria, catalog)).toMatchObject({
      matchStatus: "confirmed",
      recordedMatchStatus: "uncertain",
      payload: undefined,
    });
    expect(notice).toEqual(before);
    expect(
      currentRadarNotice(
        { ...notice, payload: JSON.stringify(q3) },
        criteria,
        catalog,
      ),
    ).toBeNull();
    expect(
      currentRadarNotice(
        { ...notice, payload: "invalid JSON" },
        criteria,
        catalog,
      ),
    ).toMatchObject({ listing: null, matchStatus: "uncertain" });
  });
});
