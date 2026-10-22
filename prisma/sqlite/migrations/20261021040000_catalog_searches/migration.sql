-- Add local filter persistence without changing vehicles, observations or provider searches.
CREATE TABLE "CatalogSearch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CatalogSearch_createdAt_idx" ON "CatalogSearch"("createdAt");
