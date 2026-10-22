CREATE TABLE "VehiclePrice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "vehicleId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    CONSTRAINT "VehiclePrice_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "VehiclePrice_vehicleId_id_idx" ON "VehiclePrice"("vehicleId", "id");
-- Snapshot at migration time, not a claim about the original publication date.
INSERT INTO "VehiclePrice" ("vehicleId", "priceCents", "reason")
SELECT "id", "priceCents", 'baseline' FROM "Vehicle";
