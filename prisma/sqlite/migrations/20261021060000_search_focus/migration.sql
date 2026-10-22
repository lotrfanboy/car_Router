-- Additive: never rebuild or clear existing user tables.
ALTER TABLE "SavedSearch" ADD COLUMN "queryKey" TEXT;
CREATE UNIQUE INDEX "SavedSearch_queryKey_key" ON "SavedSearch"("queryKey");
ALTER TABLE "DiscoveredListing" ADD COLUMN "savedAt" DATETIME;
CREATE TABLE "SearchCache" ("id" TEXT NOT NULL PRIMARY KEY, "result" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "Radar" (
 "id" TEXT NOT NULL PRIMARY KEY, "searchId" TEXT NOT NULL, "name" TEXT NOT NULL, "minPercent" REAL NOT NULL,
 "intervalHours" INTEGER NOT NULL DEFAULT 24, "enabled" BOOLEAN NOT NULL DEFAULT false,
 "lastRunAt" DATETIME, "nextRunAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "Radar_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "SavedSearch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "RadarRun" (
 "id" TEXT NOT NULL PRIMARY KEY, "radarId" TEXT NOT NULL, "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finishedAt" DATETIME, "status" TEXT NOT NULL, "message" TEXT NOT NULL,
 CONSTRAINT "RadarRun_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RadarRun_radarId_startedAt_idx" ON "RadarRun"("radarId", "startedAt");
CREATE TABLE "RadarNotice" (
 "id" TEXT NOT NULL PRIMARY KEY, "radarId" TEXT NOT NULL, "listingKey" TEXT NOT NULL, "priceCents" INTEGER NOT NULL,
 "eventKey" TEXT NOT NULL, "status" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" DATETIME,
 CONSTRAINT "RadarNotice_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RadarNotice_eventKey_key" ON "RadarNotice"("eventKey");
CREATE INDEX "RadarNotice_radarId_listingKey_idx" ON "RadarNotice"("radarId", "listingKey");
