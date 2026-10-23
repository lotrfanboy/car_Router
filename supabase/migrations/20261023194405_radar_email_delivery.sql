-- AlterTable
ALTER TABLE "RadarNotice" ADD COLUMN     "emailEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "runId" TEXT;

-- CreateTable
CREATE TABLE "RadarEmailDelivery" (
    "id" TEXT NOT NULL,
    "radarId" TEXT,
    "runId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'digest',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "providerId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RadarEmailDelivery_runId_key" ON "RadarEmailDelivery"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarEmailDelivery_idempotencyKey_key" ON "RadarEmailDelivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RadarEmailDelivery_status_nextAttemptAt_idx" ON "RadarEmailDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "RadarEmailDelivery_radarId_idx" ON "RadarEmailDelivery"("radarId");

-- CreateIndex
CREATE INDEX "RadarNotice_runId_idx" ON "RadarNotice"("runId");

-- AddForeignKey
ALTER TABLE "RadarNotice" ADD CONSTRAINT "RadarNotice_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RadarRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarEmailDelivery" ADD CONSTRAINT "RadarEmailDelivery_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarEmailDelivery" ADD CONSTRAINT "RadarEmailDelivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RadarRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only MVP outbox. No client access or user registration is introduced.
ALTER TABLE "RadarEmailDelivery" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RadarEmailDelivery" FROM anon, authenticated;
GRANT ALL ON TABLE "RadarEmailDelivery" TO service_role;
