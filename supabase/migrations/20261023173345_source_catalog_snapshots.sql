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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX "ProviderOperation_batchId_status_idx" ON "ProviderOperation"("batchId", "status");
CREATE INDEX "ProviderOperation_kind_status_completedAt_idx" ON "ProviderOperation"("kind", "status", "completedAt");
ALTER TABLE "ProviderOperation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProviderOperation" FROM anon, authenticated;
COMMENT ON TABLE "ProviderOperation" IS 'Backend-only catalog snapshots and explicitly approved bounded provider checks; immutable attempt state prevents billed retries.';
