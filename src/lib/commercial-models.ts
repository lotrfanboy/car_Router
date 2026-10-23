import reviewed from "../data/commercial-models.json";
import observations from "../data/source-model-observations.json";
import {
  catalogSchema,
  resolveCatalogVehicle,
  sourceLabelKey,
  type VehicleCatalog,
} from "./vehicle-catalog";
import type { Listing, SearchCriteria } from "./discovery";
import {
  commercialBrandName,
  commercialModelName,
  modelLabelKey,
} from "./commercial-names";
import { createHash } from "node:crypto";
const same = (a: string, b: string) => modelLabelKey(a) === modelLabelKey(b);

/** Attach exact observed labels only after their canonical parents exist. */
function applySourceModelObservations(catalog: VehicleCatalog) {
  const mappingIds = new Set(catalog.mappings.map((mapping) => mapping.id));
  const evidenceIds = new Set(catalog.evidence.map((evidence) => evidence.id));
  const seen = new Set<string>();
  const brands = new Map(
    catalog.brands.map((brand) => [modelLabelKey(brand.name), brand]),
  );
  const models = new Map(
    catalog.models.map((model) => [
      `${model.brandId}:${modelLabelKey(model.name)}`,
      model,
    ]),
  );
  for (const row of observations.observations) {
    const brand = brands.get(modelLabelKey(commercialBrandName(row.brand)));
    if (!brand) continue;
    const model = models.get(
      `${brand.id}:${modelLabelKey(row.commercialModel)}`,
    );
    if (!model) continue;
    const key = `${row.source}:${brand.id}:${row.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const evidenceId = `portal-model:${row.source}:${row.externalId}`;
    if (mappingIds.has(evidenceId)) continue;
    if (!evidenceIds.has(evidenceId)) {
      catalog.evidence.push({
        id: evidenceId,
        url: row.url,
        retrievedAt: row.observed_at,
        sha256: row.sha256,
        kind: "crosswalk",
      });
      evidenceIds.add(evidenceId);
    }
    if (
      row.source === "webmotors" &&
      row.source_identity.brandId &&
      !brand.references.some(
        (item) =>
          item.source === row.source && item.id === row.source_identity.brandId,
      )
    )
      brand.references.push({
        source: "webmotors",
        id: row.source_identity.brandId,
        name: row.brand,
        aliases: [],
        evidenceId,
      });
    const doors =
      row.source === "olx"
        ? /\b3P\b/i.test(row.model)
          ? 2
          : /\b5P\b/i.test(row.model)
            ? 4
            : undefined
        : undefined;
    const configuration = model.configurations?.find(
      (item) => item.doors === doors && doors !== undefined,
    );
    catalog.mappings.push({
      id: evidenceId,
      source: row.source as "olx" | "webmotors",
      level: "model",
      status: "confirmed",
      sourceBrand: row.brand,
      sourceBrandId: row.source_identity.brandId,
      sourceModelId: row.source_identity.modelId,
      sourceModelLabel: row.model,
      canonicalBrandId: brand.id,
      canonicalModelId: model.id,
      candidateVersionIds: [],
      ...(doors ? { doors } : {}),
      ...(configuration ? { configurationId: configuration.id } : {}),
    });
    mappingIds.add(evidenceId);
  }
}

/** Project immutable technical records into commercial models without rewriting the database. */
export function commercialCatalog(input: VehicleCatalog): VehicleCatalog {
  if (input.commercialRevision === reviewed.revision) return input;
  const catalog = structuredClone(input);
  const parents = new Map<string, string>();
  const configurations = new Map<string, string>();
  const consumed = new Set<string>();
  const models: VehicleCatalog["models"] = [];
  const aliases: NonNullable<VehicleCatalog["modelAliases"]> = [];
  for (const family of reviewed.families) {
    const brand = catalog.brands.find((row) => same(row.name, family.brand));
    if (!brand) continue;
    const members = catalog.models.filter(
      (row) =>
        row.brandId === brand.id &&
        family.members.some((member) => same(member.label, row.name)),
    );
    if (!members.length) continue;
    const primary =
      members.find((row) => same(row.name, family.name)) ?? members[0];
    const variants: NonNullable<
      VehicleCatalog["models"][number]["configurations"]
    > = [];
    for (const member of members) {
      const reviewedMember =
        family.members.find((row) => row.label === member.name) ??
        family.members.find((row) => same(row.label, member.name))!;
      if (
        "configuration" in reviewedMember &&
        typeof reviewedMember.configuration === "string"
      ) {
        variants.push({
          id: member.id,
          name: reviewedMember.configuration!,
          ...("doors" in reviewedMember &&
          typeof reviewedMember.doors === "number"
            ? { doors: reviewedMember.doors }
            : {}),
        });
        configurations.set(member.id, member.id);
      }
      aliases.push({
        id: member.id,
        name: member.name,
        modelId: primary.id,
        ...(configurations.has(member.id)
          ? { configurationId: member.id }
          : {}),
      });
      parents.set(member.id, primary.id);
      consumed.add(member.id);
    }
    models.push({
      ...primary,
      name: family.name,
      references: members.flatMap((row) => row.references),
      hasAcceptedVersions: members.some((row) => row.hasAcceptedVersions),
      versionsPending: members.some((row) => row.versionsPending),
      ...(variants.length ? { configurations: variants } : {}),
    });
  }
  catalog.models = [
    ...catalog.models.filter((row) => !consumed.has(row.id)),
    ...models,
  ];
  catalog.modelAliases = aliases;
  catalog.commercialRevision = reviewed.revision;
  catalog.versions = catalog.versions.map((row) => ({
    ...row,
    modelId: parents.get(row.modelId) ?? row.modelId,
    ...(configurations.has(row.modelId)
      ? { configurationIds: [row.modelId] }
      : {}),
  }));
  catalog.mappings = catalog.mappings.map((row) => ({
    ...row,
    ...(row.canonicalModelId
      ? {
          canonicalModelId:
            parents.get(row.canonicalModelId) ?? row.canonicalModelId,
        }
      : {}),
    ...(row.notCanonicalModelId
      ? {
          notCanonicalModelId:
            parents.get(row.notCanonicalModelId) ?? row.notCanonicalModelId,
        }
      : {}),
  }));

  applySourceModelObservations(catalog);
  return catalogSchema.parse(catalog);
}

/** Adapt legacy identity only. Version, doors and technical configurations never narrow collection. */
export function normalizeCatalogCriteria(
  catalog: VehicleCatalog,
  criteria: SearchCriteria,
): SearchCriteria {
  const normalized: SearchCriteria = { ...criteria, version: "" };
  delete normalized.doors;
  if (criteria.catalog?.provider === "carrouter") {
    normalized.catalog = { ...criteria.catalog };
    delete normalized.catalog.versionCode;
    delete normalized.catalog.versionName;
    delete normalized.catalog.configurationCode;
    delete normalized.catalog.configurationName;
  }
  const selected =
    criteria.catalog?.provider === "carrouter" ? criteria.catalog : undefined;
  if (!selected || selected.revision !== catalog.revision) return normalized;
  const brand = catalog.brands.find((row) => row.id === selected.brandCode);
  if (
    !brand ||
    selected.brandName !== brand.name ||
    criteria.brand !== brand.name
  )
    return normalized;
  const alias = catalog.modelAliases?.find(
    (row) =>
      row.id === selected.modelCode &&
      row.name === selected.modelName &&
      row.name === criteria.model,
  );
  const model = catalog.models.find(
    (row) => row.id === alias?.modelId && row.brandId === brand.id,
  );
  if (!alias || !model) return normalized;
  return {
    ...normalized,
    model: model.name,
    catalog: {
      ...normalized.catalog!,
      modelCode: model.id,
      modelName: model.name,
    },
  };
}

export function validCatalogCriteria(
  catalog: VehicleCatalog,
  criteria: SearchCriteria,
) {
  const selected =
    criteria.catalog?.provider === "carrouter" ? criteria.catalog : undefined;
  if (!selected) return true;
  const brand = catalog.brands.find((row) => row.id === selected.brandCode);
  const model = catalog.models.find(
    (row) => row.id === selected.modelCode && row.brandId === brand?.id,
  );
  return (
    !!brand &&
    selected.revision === catalog.revision &&
    selected.brandName === brand.name &&
    criteria.brand === brand.name &&
    (!selected.modelCode ||
      (!!model &&
        selected.modelName === model.name &&
        criteria.model === model.name))
  );
}

export type NativeSearchCatalogSnapshot = {
  revision: string;
  retrievedAt: string;
  evidence: VehicleCatalog["evidence"];
  brands: {
    source: "webmotors";
    sourceId?: string;
    name: string;
    models: { sourceId?: string; name: string }[];
  }[];
};
const nativeId = (scope: string, value: string) =>
  `portal:${scope}:${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;

/** Merge the entire native source tree, including models absent from the technical catalog.
 * Only literal scoped names or reviewed aliases join technical and search identities.
 * Internal hash IDs are never advertised as provider IDs.
 */
export function mergeSearchCatalog(
  input: VehicleCatalog,
  snapshot: NativeSearchCatalogSnapshot,
): VehicleCatalog {
  const projected = commercialCatalog(input);
  if (projected.searchRevision === snapshot.revision) return projected;
  if (!snapshot.evidence.length)
    throw new Error("Catálogo de busca sem evidência de origem.");
  const catalog = structuredClone(projected);
  const evidence = snapshot.evidence[0];
  for (const item of snapshot.evidence) {
    const previous = catalog.evidence.find((row) => row.id === item.id);
    if (previous && previous.sha256 !== item.sha256)
      throw new Error("Evidência do catálogo de busca conflitante.");
    if (!previous) catalog.evidence.push(item);
  }
  const brandNames = new Map<string, VehicleCatalog["brands"]>();
  const brandSourceIds = new Map<string, VehicleCatalog["brands"]>();
  const modelNames = new Map<string, VehicleCatalog["models"]>();
  const modelSourceIds = new Map<string, VehicleCatalog["models"]>();
  const add = <T>(map: Map<string, T[]>, key: string, row: T) => {
    const rows = map.get(key) ?? [];
    if (!rows.includes(row)) rows.push(row);
    map.set(key, rows);
  };
  for (const brand of catalog.brands) {
    add(brandNames, modelLabelKey(brand.name), brand);
    for (const ref of brand.references)
      add(brandSourceIds, `${ref.source}:${ref.id}`, brand);
  }
  for (const model of catalog.models) {
    add(modelNames, `${model.brandId}:${modelLabelKey(model.name)}`, model);
    for (const ref of model.references)
      add(modelSourceIds, `${ref.source}:${model.brandId}:${ref.id}`, model);
  }
  const addReference = (
    entity: VehicleCatalog["brands"][number],
    source: "webmotors",
    sourceId: string | undefined,
    name: string,
  ) => {
    if (
      !sourceId ||
      entity.references.some(
        (ref) => ref.source === source && ref.id === sourceId,
      )
    )
      return;
    entity.references.push({
      source,
      id: sourceId,
      name,
      aliases: [],
      evidenceId: evidence.id,
    });
  };
  // A refresh replaces outbound contracts from this native source; observation
  // mappings remain independent evidence about returned listings.
  catalog.queryTargets = (catalog.queryTargets ?? []).filter(
    (target) => target.source !== "webmotors",
  );
  const seenTargets = new Set<string>();
  for (const nativeBrand of snapshot.brands) {
    const brandName = nativeBrand.name.trim().replace(/\s+/g, " ");
    const canonicalBrandName = commercialBrandName(brandName);
    if (!brandName) throw new Error("Marca vazia no catálogo de busca.");
    const bySourceId = nativeBrand.sourceId
      ? (brandSourceIds.get(`${nativeBrand.source}:${nativeBrand.sourceId}`) ??
        [])
      : [];
    const brandCandidates = bySourceId.length
      ? bySourceId
      : (brandNames.get(modelLabelKey(canonicalBrandName)) ?? []);
    if (brandCandidates.length > 1)
      throw new Error(`Marca ambígua no catálogo de busca: ${brandName}`);
    let brand = brandCandidates[0];
    if (!brand) {
      brand = {
        id: nativeId(
          `${nativeBrand.source}:brand`,
          modelLabelKey(canonicalBrandName),
        ),
        name: canonicalBrandName,
        references: [],
      };
      catalog.brands.push(brand);
      add(brandNames, modelLabelKey(brand.name), brand);
    }
    if (nativeBrand.sourceId)
      add(
        brandSourceIds,
        `${nativeBrand.source}:${nativeBrand.sourceId}`,
        brand,
      );
    addReference(brand, nativeBrand.source, nativeBrand.sourceId, brandName);
    for (const nativeModel of nativeBrand.models) {
      const sourceModel = nativeModel.name.trim().replace(/\s+/g, " ");
      if (!sourceModel) throw new Error(`Modelo vazio na marca ${brandName}.`);
      const canonicalName = commercialModelName(brand.name, sourceModel);
      const bySourceId = nativeModel.sourceId
        ? (modelSourceIds.get(
            `${nativeBrand.source}:${brand.id}:${nativeModel.sourceId}`,
          ) ?? [])
        : [];
      const byName =
        modelNames.get(`${brand.id}:${modelLabelKey(canonicalName)}`) ?? [];
      const modelCandidates = bySourceId.length ? bySourceId : byName;
      if (modelCandidates.length > 1)
        throw new Error(
          `Modelo ambíguo no catálogo de busca: ${brandName} ${sourceModel}`,
        );
      let model = modelCandidates[0];
      if (!model) {
        model = {
          id: nativeId(
            `${nativeBrand.source}:model`,
            `${brand.id}:${modelLabelKey(canonicalName)}`,
          ),
          brandId: brand.id,
          name: canonicalName,
          references: [],
        };
        catalog.models.push(model);
        add(modelNames, `${brand.id}:${modelLabelKey(model.name)}`, model);
      }
      if (nativeModel.sourceId)
        add(
          modelSourceIds,
          `${nativeBrand.source}:${brand.id}:${nativeModel.sourceId}`,
          model,
        );
      addReference(
        model,
        nativeBrand.source,
        nativeModel.sourceId,
        sourceModel,
      );
      const key = `${nativeBrand.source}:${nativeBrand.sourceId ?? sourceLabelKey(brandName)}:${nativeModel.sourceId ?? sourceLabelKey(sourceModel)}`;
      if (seenTargets.has(key)) continue;
      seenTargets.add(key);
      catalog.queryTargets.push({
        id: nativeId("query", key),
        source: nativeBrand.source,
        canonicalBrandId: brand.id,
        canonicalModelId: model.id,
        sourceBrand: brandName,
        sourceModel,
        ...(nativeBrand.sourceId
          ? { sourceBrandId: nativeBrand.sourceId }
          : {}),
        ...(nativeModel.sourceId
          ? { sourceModelId: nativeModel.sourceId }
          : {}),
        evidenceId: evidence.id,
        status: "confirmed",
      });
    }
  }
  catalog.searchRevision = snapshot.revision;
  applySourceModelObservations(catalog);
  return catalogSchema.parse(catalog);
}

/** Re-resolve persisted observations on read; original source fields remain available. */
export function commercialListing(
  catalog: VehicleCatalog,
  row: Listing,
): Listing {
  if (row.original || row.sourceIdentity || row.sourceModel) {
    const version = row.original?.version ?? row.version;
    const explicitDoors = version?.match(/\b([24])\s*P\b/i);
    const resolved = resolveCatalogVehicle(catalog, {
      source: row.source,
      brand: row.original?.brand ?? row.brand,
      model: row.original?.model ?? row.sourceModel ?? row.model,
      version,
      ...row.sourceIdentity,
      doors:
        row.doors ??
        (row.source === "webmotors" && explicitDoors
          ? Number(explicitDoors[1])
          : undefined),
    });
    return {
      ...row,
      brand: resolved.brand?.name ?? row.brand,
      model: resolved.model?.name ?? row.model,
      version: resolved.version?.name ?? row.version,
      identity: resolved.identity,
      catalogResolution: resolved.classification,
      doors: resolved.doors,
    };
  }
  const modelId = row.identity?.modelId;
  const alias = catalog.modelAliases?.find((item) => item.id === modelId);
  const model = catalog.models.find((item) => item.id === alias?.modelId);
  return model && row.identity
    ? {
        ...row,
        model: model.name,
        identity: {
          ...row.identity,
          modelId: model.id,
          ...(alias?.configurationId
            ? { configurationId: alias.configurationId }
            : {}),
        },
      }
    : row;
}
