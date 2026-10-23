import { catalogSchema, type VehicleCatalog } from "./vehicle-catalog";
import bundled from "../data/vehicle-catalog.json";
import { commercialCatalog } from "./commercial-models";

let cached: { revisionId: string; catalog: VehicleCatalog } | undefined;
const refreshIntervalMs = 30_000;
let checkedAt = 0;
let inFlight: Promise<VehicleCatalog> | undefined;
const parseArray = (value: string) => {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string")
  )
    throw new Error("Lista persistida do catálogo é inválida.");
  return parsed;
};

/** Reads only the active, validated database revision. No provider is called. */
export async function readVehicleCatalog(): Promise<VehicleCatalog> {
  if (cached && Date.now() - checkedAt < refreshIntervalMs)
    return cached.catalog;
  if (!inFlight) {
    inFlight = loadVehicleCatalog()
      .then((catalog) => {
        checkedAt = Date.now();
        return catalog;
      })
      .finally(() => {
        inFlight = undefined;
      });
  }
  return inFlight;
}

async function loadVehicleCatalog(): Promise<VehicleCatalog> {
  try {
    const { db } = await import("./db");
    const state = await db.catalogState.findUnique({
      where: { id: "vehicle-catalog" },
      select: { activeRevisionId: true },
    });
    if (!state?.activeRevisionId) {
      const catalog =
        cached?.revisionId === "bundled"
          ? cached.catalog
          : commercialCatalog(catalogSchema.parse(bundled));
      cached = { revisionId: "bundled", catalog };
      return catalog;
    }
    if (cached?.revisionId === state.activeRevisionId) return cached.catalog;
    const revisionId = state.activeRevisionId;
    const [revision, sources, brands, models, versions, mappings] =
      await Promise.all([
        db.catalogRevision.findUniqueOrThrow({ where: { id: revisionId } }),
        db.catalogSource.findMany({
          where: { revisionId },
          orderBy: { id: "asc" },
        }),
        db.catalogBrand.findMany({
          where: { revisionId },
          orderBy: { name: "asc" },
        }),
        db.catalogModel.findMany({
          where: { revisionId },
          orderBy: { name: "asc" },
        }),
        db.catalogVersion.findMany({
          where: { revisionId },
          orderBy: { name: "asc" },
        }),
        db.catalogSourceMapping.findMany({
          where: { revisionId },
          orderBy: { id: "asc" },
        }),
      ]);
    if (revision.status !== "active")
      throw new Error("A revisão ativa do catálogo não foi validada.");
    const timestamp = (
      revision.validatedAt ?? revision.createdAt
    ).toISOString();
    const catalog = commercialCatalog(
      catalogSchema.parse({
        schemaVersion: 1,
        revision: revision.id,
        evidence: sources.map((source) => ({
          id: source.id,
          url: source.url,
          retrievedAt: timestamp,
          sha256: source.sha256,
          kind: "catalog" as const,
        })),
        brands: brands.map((row) => ({
          id: row.id,
          name: row.name,
          references: [],
        })),
        models: models.map((row) => ({
          id: row.id,
          brandId: row.brandId,
          name: row.name,
          versionsPending: row.versionsPending,
          hasAcceptedVersions: row.hasAcceptedVersions,
          references: [],
        })),
        versions: versions.map((row) => ({
          id: row.id,
          modelId: row.modelId,
          name: row.name,
          engine: row.engine,
          transmission: row.transmission,
          references: [],
        })),
        mappings: mappings.map((row) => ({
          id: row.id,
          source: row.source,
          level: row.level,
          status: row.status,
          sourceBrand: row.sourceBrand,
          sourceBrandId: row.sourceBrandId,
          sourceModelId: row.sourceModelId,
          sourceModelLabel: row.sourceModelLabel,
          sourceVersionId: row.sourceVersionId,
          sourceVersionLabel: row.sourceVersionLabel,
          canonicalBrandId: row.canonicalBrandId,
          canonicalModelId: row.canonicalModelId,
          canonicalVersionId: row.canonicalVersionId,
          notCanonicalModelId: row.notCanonicalModelId,
          candidateVersionIds: parseArray(row.candidateVersionIds),
        })),
      }),
    );
    cached = { revisionId, catalog };
    return catalog;
  } catch (error) {
    // A transient read failure must never replace a previously valid catalog
    // with an empty revision.
    if (cached) return cached.catalog;
    throw error;
  }
}
