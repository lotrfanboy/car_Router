-- CreateTable
CREATE TABLE "CatalogRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaVersion" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "brandCount" INTEGER NOT NULL,
    "modelCount" INTEGER NOT NULL,
    "versionCount" INTEGER NOT NULL,
    "evidenceCount" INTEGER NOT NULL,
    "modelsWithoutVersion" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" DATETIME,
    "activatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CatalogState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activeRevisionId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CatalogState_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "CatalogRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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

    PRIMARY KEY ("revisionId", "id"),
    CONSTRAINT "CatalogSource_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogEvidence" (
    "revisionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" TEXT NOT NULL,

    PRIMARY KEY ("revisionId", "id"),
    CONSTRAINT "CatalogEvidence_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogEvidence_revisionId_sourceId_fkey" FOREIGN KEY ("revisionId", "sourceId") REFERENCES "CatalogSource" ("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogBrand" (
    "revisionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceIds" TEXT NOT NULL,
    "sourceLabels" TEXT NOT NULL,
    "identityDecisionIds" TEXT NOT NULL,

    PRIMARY KEY ("revisionId", "id"),
    CONSTRAINT "CatalogBrand_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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

    PRIMARY KEY ("revisionId", "id"),
    CONSTRAINT "CatalogModel_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogModel_revisionId_brandId_fkey" FOREIGN KEY ("revisionId", "brandId") REFERENCES "CatalogBrand" ("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
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

    PRIMARY KEY ("revisionId", "id"),
    CONSTRAINT "CatalogVersion_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogVersion_revisionId_modelId_fkey" FOREIGN KEY ("revisionId", "modelId") REFERENCES "CatalogModel" ("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogBrandEvidence" (
    "revisionId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    PRIMARY KEY ("revisionId", "brandId", "evidenceId"),
    CONSTRAINT "CatalogBrandEvidence_revisionId_brandId_fkey" FOREIGN KEY ("revisionId", "brandId") REFERENCES "CatalogBrand" ("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogBrandEvidence_revisionId_evidenceId_fkey" FOREIGN KEY ("revisionId", "evidenceId") REFERENCES "CatalogEvidence" ("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogModelEvidence" (
    "revisionId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    PRIMARY KEY ("revisionId", "modelId", "evidenceId"),
    CONSTRAINT "CatalogModelEvidence_revisionId_modelId_fkey" FOREIGN KEY ("revisionId", "modelId") REFERENCES "CatalogModel" ("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogModelEvidence_revisionId_evidenceId_fkey" FOREIGN KEY ("revisionId", "evidenceId") REFERENCES "CatalogEvidence" ("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogVersionEvidence" (
    "revisionId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    PRIMARY KEY ("revisionId", "versionId", "evidenceId"),
    CONSTRAINT "CatalogVersionEvidence_revisionId_versionId_fkey" FOREIGN KEY ("revisionId", "versionId") REFERENCES "CatalogVersion" ("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogVersionEvidence_revisionId_evidenceId_fkey" FOREIGN KEY ("revisionId", "evidenceId") REFERENCES "CatalogEvidence" ("revisionId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogIdentityCrosswalk" (
    "revisionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "previousIdentityId" TEXT NOT NULL,
    "canonicalIdentityId" TEXT NOT NULL,

    PRIMARY KEY ("revisionId", "entityType", "previousIdentityId"),
    CONSTRAINT "CatalogIdentityCrosswalk_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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

    PRIMARY KEY ("revisionId", "id"),
    CONSTRAINT "CatalogSourceMapping_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
CREATE INDEX "CatalogIdentityCrosswalk_revisionId_entityType_canonicalIdentityId_idx" ON "CatalogIdentityCrosswalk"("revisionId", "entityType", "canonicalIdentityId");

-- CreateIndex
CREATE INDEX "CatalogSourceMapping_revisionId_source_level_status_idx" ON "CatalogSourceMapping"("revisionId", "source", "level", "status");

-- CreateIndex
CREATE INDEX "CatalogSourceMapping_revisionId_canonicalModelId_idx" ON "CatalogSourceMapping"("revisionId", "canonicalModelId");

-- CreateIndex
CREATE INDEX "CatalogSourceMapping_revisionId_notCanonicalModelId_idx" ON "CatalogSourceMapping"("revisionId", "notCanonicalModelId");
-- End of additive vehicle catalog migration.
