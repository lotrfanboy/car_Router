-- Keep the legacy source text untouched while separating who is selling.
ALTER TABLE "Vehicle" ADD COLUMN "sellerType" TEXT;
