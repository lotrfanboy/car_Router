CREATE TABLE "SavedSearch" (
  "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "criteria" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SearchRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "searchId" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "result" TEXT NOT NULL,
  CONSTRAINT "SearchRun_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "SavedSearch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SearchRun_searchId_createdAt_idx" ON "SearchRun"("searchId", "createdAt");
CREATE TABLE "DiscoveredListing" (
  "id" TEXT NOT NULL PRIMARY KEY, "source" TEXT NOT NULL, "externalId" TEXT NOT NULL, "payload" TEXT NOT NULL,
  "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DiscoveredListing_source_externalId_key" ON "DiscoveredListing"("source", "externalId");
CREATE TABLE "ListingPrice" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "listingId" TEXT NOT NULL, "priceCents" INTEGER NOT NULL,
  "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingPrice_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DiscoveredListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ListingPrice_listingId_id_idx" ON "ListingPrice"("listingId", "id");
CREATE TABLE "ProviderSpend" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "provider" TEXT NOT NULL, "credits" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ProviderSpend_provider_createdAt_idx" ON "ProviderSpend"("provider", "createdAt");
CREATE TABLE "SearchLock" ("id" TEXT NOT NULL PRIMARY KEY, "expiresAt" DATETIME NOT NULL);
