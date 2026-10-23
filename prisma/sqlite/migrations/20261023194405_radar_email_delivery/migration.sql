-- CreateTable
CREATE TABLE "RadarEmailDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "radarId" TEXT,
    "runId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'digest',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstAttemptAt" DATETIME,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    "providerId" TEXT,
    "acceptedAt" DATETIME,
    "deliveredAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RadarEmailDelivery_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RadarEmailDelivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RadarRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RadarNotice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "radarId" TEXT NOT NULL,
    "listingKey" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'discount',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "matchStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "payload" TEXT,
    "previousPriceCents" INTEGER,
    "runId" TEXT,
    "emailEligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    CONSTRAINT "RadarNotice_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RadarRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RadarNotice_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RadarNotice" ("channel", "createdAt", "eventKey", "id", "kind", "listingKey", "matchStatus", "payload", "previousPriceCents", "priceCents", "radarId", "sentAt", "status") SELECT "channel", "createdAt", "eventKey", "id", "kind", "listingKey", "matchStatus", "payload", "previousPriceCents", "priceCents", "radarId", "sentAt", "status" FROM "RadarNotice";
DROP TABLE "RadarNotice";
ALTER TABLE "new_RadarNotice" RENAME TO "RadarNotice";
CREATE UNIQUE INDEX "RadarNotice_eventKey_key" ON "RadarNotice"("eventKey");
CREATE INDEX "RadarNotice_radarId_listingKey_idx" ON "RadarNotice"("radarId", "listingKey");
CREATE INDEX "RadarNotice_runId_idx" ON "RadarNotice"("runId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RadarEmailDelivery_runId_key" ON "RadarEmailDelivery"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarEmailDelivery_idempotencyKey_key" ON "RadarEmailDelivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RadarEmailDelivery_status_nextAttemptAt_idx" ON "RadarEmailDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "RadarEmailDelivery_radarId_idx" ON "RadarEmailDelivery"("radarId");

