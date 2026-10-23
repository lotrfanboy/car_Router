CREATE TABLE "ProviderOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "credits" INTEGER NOT NULL,
  "request" TEXT NOT NULL,
  "response" TEXT,
  "summary" TEXT,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);
CREATE INDEX "ProviderOperation_batchId_status_idx" ON "ProviderOperation"("batchId", "status");
CREATE INDEX "ProviderOperation_kind_status_completedAt_idx" ON "ProviderOperation"("kind", "status", "completedAt");
