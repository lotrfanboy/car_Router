-- Additive local-test mirror of the Supabase migration.
ALTER TABLE "Radar" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'discount';
ALTER TABLE "Radar" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email';
ALTER TABLE "Radar" ADD COLUMN "runsRemaining" INTEGER;

ALTER TABLE "RadarNotice" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'discount';
ALTER TABLE "RadarNotice" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email';
ALTER TABLE "RadarNotice" ADD COLUMN "matchStatus" TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE "RadarNotice" ADD COLUMN "payload" TEXT;
ALTER TABLE "RadarNotice" ADD COLUMN "previousPriceCents" INTEGER;

CREATE TABLE "RadarSourceState" (
  "radarId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "initializedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("radarId", "source"),
  CONSTRAINT "RadarSourceState_radarId_fkey" FOREIGN KEY ("radarId")
    REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RadarObservation" (
  "radarId" TEXT NOT NULL,
  "listingKey" TEXT NOT NULL,
  "priceCents" INTEGER,
  "lastNotifiedPriceCents" INTEGER,
  "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("radarId", "listingKey"),
  CONSTRAINT "RadarObservation_radarId_fkey" FOREIGN KEY ("radarId")
    REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
