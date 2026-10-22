-- CreateTable
CREATE TABLE "CatalogRevision" (
    "id" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "brandCount" INTEGER NOT NULL,
    "modelCount" INTEGER NOT NULL,
    "versionCount" INTEGER NOT NULL,
    "evidenceCount" INTEGER NOT NULL,
    "modelsWithoutVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogState" (
    "id" TEXT NOT NULL,
    "activeRevisionId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSource" (
    "revisionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "publicationCycle" INTEGER NOT NULL,
    "cycleIsNotModelYear" BOOLEAN NOT NULL,

    CONSTRAINT "CatalogSource_pkey" PRIMARY KEY ("revisionId","id")
);

-- CreateTable
CREATE TABLE "CatalogEvidence" (
    "revisionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" TEXT NOT NULL,

    CONSTRAINT "CatalogEvidence_pkey" PRIMARY KEY ("revisionId","id")
);

-- CreateTable
CREATE TABLE "CatalogBrand" (
    "revisionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceIds" TEXT NOT NULL,
    "sourceLabels" TEXT NOT NULL,
    "identityDecisionIds" TEXT NOT NULL,

    CONSTRAINT "CatalogBrand_pkey" PRIMARY KEY ("revisionId","id")
);

-- CreateTable
CREATE TABLE "CatalogModel" (
    "revisionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceIds" TEXT NOT NULL,
    "sourceLabels" TEXT NOT NULL,
    "versionsPending" BOOLEAN NOT NULL,
    "hasAcceptedVersions" BOOLEAN NOT NULL,

    CONSTRAINT "CatalogModel_pkey" PRIMARY KEY ("revisionId","id")
);

-- CreateTable
CREATE TABLE "CatalogVersion" (
    "revisionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "transmission" TEXT NOT NULL,
    "sourceIds" TEXT NOT NULL,
    "sourceLabels" TEXT NOT NULL,

    CONSTRAINT "CatalogVersion_pkey" PRIMARY KEY ("revisionId","id")
);

-- CreateTable
CREATE TABLE "CatalogBrandEvidence" (
    "revisionId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    CONSTRAINT "CatalogBrandEvidence_pkey" PRIMARY KEY ("revisionId","brandId","evidenceId")
);

-- CreateTable
CREATE TABLE "CatalogModelEvidence" (
    "revisionId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    CONSTRAINT "CatalogModelEvidence_pkey" PRIMARY KEY ("revisionId","modelId","evidenceId")
);

-- CreateTable
CREATE TABLE "CatalogVersionEvidence" (
    "revisionId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    CONSTRAINT "CatalogVersionEvidence_pkey" PRIMARY KEY ("revisionId","versionId","evidenceId")
);

-- CreateTable
CREATE TABLE "CatalogIdentityCrosswalk" (
    "revisionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "previousIdentityId" TEXT NOT NULL,
    "canonicalIdentityId" TEXT NOT NULL,

    CONSTRAINT "CatalogIdentityCrosswalk_pkey" PRIMARY KEY ("revisionId","entityType","previousIdentityId")
);

-- CreateTable
CREATE TABLE "CatalogSourceMapping" (
    "revisionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceBrand" TEXT,
    "sourceBrandId" TEXT,
    "sourceModelId" TEXT,
    "sourceModelLabel" TEXT,
    "sourceVersionId" TEXT,
    "sourceVersionLabel" TEXT,
    "canonicalBrandId" TEXT,
    "canonicalModelId" TEXT,
    "canonicalVersionId" TEXT,
    "notCanonicalModelId" TEXT,
    "candidateVersionIds" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "reviewedAt" TEXT,

    CONSTRAINT "CatalogSourceMapping_pkey" PRIMARY KEY ("revisionId","id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogRevision_sourceSha256_key" ON "CatalogRevision"("sourceSha256");

-- CreateIndex
CREATE INDEX "CatalogEvidence_revisionId_sourceId_idx" ON "CatalogEvidence"("revisionId", "sourceId");

-- CreateIndex
CREATE INDEX "CatalogEvidence_revisionId_status_idx" ON "CatalogEvidence"("revisionId", "status");

-- CreateIndex
CREATE INDEX "CatalogBrand_revisionId_name_idx" ON "CatalogBrand"("revisionId", "name");

-- CreateIndex
CREATE INDEX "CatalogModel_revisionId_brandId_name_idx" ON "CatalogModel"("revisionId", "brandId", "name");

-- CreateIndex
CREATE INDEX "CatalogVersion_revisionId_modelId_name_idx" ON "CatalogVersion"("revisionId", "modelId", "name");

-- CreateIndex
CREATE INDEX "CatalogBrandEvidence_revisionId_evidenceId_idx" ON "CatalogBrandEvidence"("revisionId", "evidenceId");

-- CreateIndex
CREATE INDEX "CatalogModelEvidence_revisionId_evidenceId_idx" ON "CatalogModelEvidence"("revisionId", "evidenceId");

-- CreateIndex
CREATE INDEX "CatalogVersionEvidence_revisionId_evidenceId_idx" ON "CatalogVersionEvidence"("revisionId", "evidenceId");

-- CreateIndex
CREATE INDEX "CatalogIdentityCrosswalk_revisionId_entityType_canonicalIde_idx" ON "CatalogIdentityCrosswalk"("revisionId", "entityType", "canonicalIdentityId");

-- CreateIndex
CREATE INDEX "CatalogSourceMapping_revisionId_source_level_status_idx" ON "CatalogSourceMapping"("revisionId", "source", "level", "status");

-- CreateIndex
CREATE INDEX "CatalogSourceMapping_revisionId_canonicalModelId_idx" ON "CatalogSourceMapping"("revisionId", "canonicalModelId");

-- CreateIndex
CREATE INDEX "CatalogSourceMapping_revisionId_notCanonicalModelId_idx" ON "CatalogSourceMapping"("revisionId", "notCanonicalModelId");

-- AddForeignKey
ALTER TABLE "CatalogState" ADD CONSTRAINT "CatalogState_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "CatalogRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSource" ADD CONSTRAINT "CatalogSource_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogEvidence" ADD CONSTRAINT "CatalogEvidence_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogEvidence" ADD CONSTRAINT "CatalogEvidence_revisionId_sourceId_fkey" FOREIGN KEY ("revisionId", "sourceId") REFERENCES "CatalogSource"("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogBrand" ADD CONSTRAINT "CatalogBrand_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogModel" ADD CONSTRAINT "CatalogModel_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogModel" ADD CONSTRAINT "CatalogModel_revisionId_brandId_fkey" FOREIGN KEY ("revisionId", "brandId") REFERENCES "CatalogBrand"("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVersion" ADD CONSTRAINT "CatalogVersion_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVersion" ADD CONSTRAINT "CatalogVersion_revisionId_modelId_fkey" FOREIGN KEY ("revisionId", "modelId") REFERENCES "CatalogModel"("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogBrandEvidence" ADD CONSTRAINT "CatalogBrandEvidence_revisionId_brandId_fkey" FOREIGN KEY ("revisionId", "brandId") REFERENCES "CatalogBrand"("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogBrandEvidence" ADD CONSTRAINT "CatalogBrandEvidence_revisionId_evidenceId_fkey" FOREIGN KEY ("revisionId", "evidenceId") REFERENCES "CatalogEvidence"("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogModelEvidence" ADD CONSTRAINT "CatalogModelEvidence_revisionId_modelId_fkey" FOREIGN KEY ("revisionId", "modelId") REFERENCES "CatalogModel"("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogModelEvidence" ADD CONSTRAINT "CatalogModelEvidence_revisionId_evidenceId_fkey" FOREIGN KEY ("revisionId", "evidenceId") REFERENCES "CatalogEvidence"("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVersionEvidence" ADD CONSTRAINT "CatalogVersionEvidence_revisionId_versionId_fkey" FOREIGN KEY ("revisionId", "versionId") REFERENCES "CatalogVersion"("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVersionEvidence" ADD CONSTRAINT "CatalogVersionEvidence_revisionId_evidenceId_fkey" FOREIGN KEY ("revisionId", "evidenceId") REFERENCES "CatalogEvidence"("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogIdentityCrosswalk" ADD CONSTRAINT "CatalogIdentityCrosswalk_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSourceMapping" ADD CONSTRAINT "CatalogSourceMapping_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The server uses the direct PostgreSQL connection. Keep catalog internals
-- unreachable through Supabase's browser-facing Data API.
revoke all on table
  "CatalogRevision", "CatalogState", "CatalogSource", "CatalogEvidence",
  "CatalogBrand", "CatalogModel", "CatalogVersion", "CatalogBrandEvidence",
  "CatalogModelEvidence", "CatalogVersionEvidence", "CatalogIdentityCrosswalk",
  "CatalogSourceMapping"
from anon, authenticated, service_role;

alter table "CatalogRevision" enable row level security;
alter table "CatalogState" enable row level security;
alter table "CatalogSource" enable row level security;
alter table "CatalogEvidence" enable row level security;
alter table "CatalogBrand" enable row level security;
alter table "CatalogModel" enable row level security;
alter table "CatalogVersion" enable row level security;
alter table "CatalogBrandEvidence" enable row level security;
alter table "CatalogModelEvidence" enable row level security;
alter table "CatalogVersionEvidence" enable row level security;
alter table "CatalogIdentityCrosswalk" enable row level security;
alter table "CatalogSourceMapping" enable row level security;
