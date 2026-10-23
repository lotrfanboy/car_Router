-- Preserve legacy discount/e-mail behavior while allowing internal notices.
ALTER TABLE "Radar"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'discount',
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN "runsRemaining" INTEGER;

ALTER TABLE "RadarNotice"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'discount',
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN "matchStatus" TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN "payload" TEXT,
  ADD COLUMN "previousPriceCents" INTEGER;

CREATE TABLE "RadarSourceState" (
  "radarId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "initializedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadarSourceState_pkey" PRIMARY KEY ("radarId", "source"),
  CONSTRAINT "RadarSourceState_radarId_fkey" FOREIGN KEY ("radarId")
    REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RadarObservation" (
  "radarId" TEXT NOT NULL,
  "listingKey" TEXT NOT NULL,
  "priceCents" INTEGER,
  "lastNotifiedPriceCents" INTEGER,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadarObservation_pkey" PRIMARY KEY ("radarId", "listingKey"),
  CONSTRAINT "RadarObservation_radarId_fkey" FOREIGN KEY ("radarId")
    REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The application uses its existing direct PostgreSQL connection. Do not expose
-- notification history or observation state through the browser-facing Data API.
REVOKE ALL ON TABLE "RadarSourceState", "RadarObservation"
  FROM anon, authenticated, service_role;
ALTER TABLE "RadarSourceState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RadarObservation" ENABLE ROW LEVEL SECURITY;
