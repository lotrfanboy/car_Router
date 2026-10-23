import reviewed from "../data/commercial-models.json";
import observations from "../data/source-model-observations.json";
import {
  catalogSchema,
  resolveCatalogVehicle,
  type VehicleCatalog,
} from "./vehicle-catalog";
import type { Listing, SearchCriteria } from "./discovery";
import { modelLabelKey } from "./commercial-names";
const same = (a: string, b: string) => modelLabelKey(a) === modelLabelKey(b);

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
      if ("configuration" in reviewedMember) {
        variants.push({
          id: member.id,
          name: reviewedMember.configuration!,
          ...("doors" in reviewedMember ? { doors: reviewedMember.doors } : {}),
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

  // Exact, persisted portal observations. The technical families above do not
  // constitute external IDs or permission to infer unseen trim descriptions.
  const brand = catalog.brands.find((row) => same(row.name, "CHEVROLET"));
  if (brand) {
    const seen = new Set<string>();
    for (const row of observations.observations) {
      const model = catalog.models.find(
        (item) =>
          item.brandId === brand.id && same(item.name, row.commercialModel),
      );
      if (!model) continue;
      const key = `${row.source}:${row.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const evidenceId = `portal-model:${row.source}:${row.externalId}`;
      catalog.evidence.push({
        id: evidenceId,
        url: row.url,
        retrievedAt: row.observed_at,
        sha256: row.sha256,
        kind: "crosswalk",
      });
      if (
        row.source === "webmotors" &&
        row.source_identity.brandId &&
        !brand.references.some(
          (item) =>
            item.source === row.source &&
            item.id === row.source_identity.brandId,
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
    }
  }
  return catalogSchema.parse(catalog);
}

/** Preserve an old selection's exact configuration while exposing its commercial model. */
export function normalizeCatalogCriteria(
  catalog: VehicleCatalog,
  criteria: SearchCriteria,
): SearchCriteria {
  const selected =
    criteria.catalog?.provider === "carrouter" ? criteria.catalog : undefined;
  if (!selected || selected.revision !== catalog.revision) return criteria;
  const brand = catalog.brands.find((row) => row.id === selected.brandCode);
  if (
    !brand ||
    selected.brandName !== brand.name ||
    criteria.brand !== brand.name
  )
    return criteria;
  const alias = catalog.modelAliases?.find(
    (row) =>
      row.id === selected.modelCode &&
      row.name === selected.modelName &&
      row.name === criteria.model,
  );
  const model = catalog.models.find(
    (row) => row.id === alias?.modelId && row.brandId === brand.id,
  );
  if (!alias || !model) return criteria;
  const configuration =
    !selected.configurationCode && alias.configurationId
      ? model.configurations?.find((row) => row.id === alias.configurationId)
      : undefined;
  return {
    ...criteria,
    model: model.name,
    ...(configuration?.doors === 2 || configuration?.doors === 4
      ? { doors: configuration.doors }
      : {}),
    catalog: {
      ...selected,
      modelCode: model.id,
      modelName: model.name,
      ...(configuration
        ? {
            configurationCode: configuration.id,
            configurationName: configuration.name,
          }
        : {}),
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
  const version = catalog.versions.find(
    (row) => row.id === selected.versionCode && row.modelId === model?.id,
  );
  const configuration = model?.configurations?.find(
    (row) => row.id === selected.configurationCode,
  );
  return (
    !!brand &&
    selected.revision === catalog.revision &&
    selected.brandName === brand.name &&
    criteria.brand === brand.name &&
    (!selected.modelCode ||
      (!!model &&
        selected.modelName === model.name &&
        criteria.model === model.name)) &&
    (!selected.versionCode ||
      (!!version &&
        selected.versionName === version.name &&
        criteria.version === version.name)) &&
    (!selected.configurationCode ||
      (!!configuration &&
        selected.configurationName === configuration.name &&
        (!configuration.doors || criteria.doors === configuration.doors) &&
        (!version || !!version.configurationIds?.includes(configuration.id))))
  );
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
