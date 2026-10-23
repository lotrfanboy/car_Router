import { z } from "zod";

/** Identity normalization only. No model/trim names or text-cutting rules. */
export const catalogKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1.")
    .replace(/[^a-z0-9.+]+/g, "");
/** Outbound native labels remain distinct even when classification ignores punctuation. */
export const sourceLabelKey = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const id = z.string().trim().min(1).max(240);
const name = z.string().trim().min(1).max(240);
const reference = z.object({
  source: z.enum(["webmotors", "olx", "fipe"]),
  id,
  name,
  aliases: z.array(name).default([]),
  evidenceId: id,
});
const entity = z.object({
  id,
  name,
  references: z.array(reference).default([]),
});
const sourceMapping = z.object({
  id,
  source: z.enum(["webmotors", "olx"]),
  level: z.enum(["model", "version"]),
  status: z.enum(["confirmed", "divergent", "pending", "ambiguous"]),
  sourceBrand: name.nullable().optional(),
  sourceBrandId: id.nullable().optional(),
  sourceModelId: id.nullable().optional(),
  sourceModelLabel: name.nullable().optional(),
  sourceVersionId: id.nullable().optional(),
  sourceVersionLabel: name.nullable().optional(),
  canonicalBrandId: id.nullable().optional(),
  canonicalModelId: id.nullable().optional(),
  canonicalVersionId: id.nullable().optional(),
  notCanonicalModelId: id.nullable().optional(),
  candidateVersionIds: z.array(id).default([]),
  configurationId: id.optional(),
  doors: z.number().int().min(2).max(5).optional(),
});
const queryTarget = z.object({
  id,
  source: z.enum(["webmotors", "olx"]),
  canonicalBrandId: id,
  canonicalModelId: id,
  sourceBrand: name,
  sourceModel: name,
  sourceBrandId: id.optional(),
  sourceModelId: id.optional(),
  evidenceId: id,
  status: z.literal("confirmed"),
});
export type CatalogQueryTarget = z.infer<typeof queryTarget>;

export const catalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: id,
    evidence: z.array(
      z.object({
        id,
        url: z.url(),
        retrievedAt: z.iso.datetime(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        kind: z.enum(["catalog", "crosswalk"]),
      }),
    ),
    brands: z.array(entity),
    models: z.array(
      entity.extend({
        brandId: id,
        versionsPending: z.boolean().optional(),
        hasAcceptedVersions: z.boolean().optional(),
        configurations: z
          .array(
            z.object({
              id,
              name,
              doors: z.number().int().min(2).max(5).optional(),
            }),
          )
          .optional(),
      }),
    ),
    versions: z.array(
      entity.extend({
        modelId: id,
        engine: z.string().optional(),
        transmission: z.string().optional(),
        configurationIds: z.array(id).optional(),
      }),
    ),
    mappings: z.array(sourceMapping).default([]),
    modelAliases: z
      .array(
        z.object({ id, name, modelId: id, configurationId: id.optional() }),
      )
      .optional(),
    commercialRevision: id.optional(),
    queryTargets: z.array(queryTarget).optional(),
    searchRevision: id.optional(),
  })
  .superRefine((data, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const evidence = new Set(data.evidence.map((item) => item.id));
    if (evidence.size !== data.evidence.length)
      fail("Identificador de evidência duplicado.");
    const brands = new Set(data.brands.map((item) => item.id));
    const models = new Set(data.models.map((item) => item.id));
    const modelParents = new Map(
      data.models.map((item) => [item.id, item.brandId]),
    );
    const targetKeys = new Set<string>();
    const targetIds = new Set<string>();
    for (const target of data.queryTargets ?? []) {
      if (!evidence.has(target.evidenceId))
        fail("Critério remoto sem evidência.");
      if (
        !brands.has(target.canonicalBrandId) ||
        modelParents.get(target.canonicalModelId) !== target.canonicalBrandId
      )
        fail("Critério remoto aponta para marca/modelo incompatíveis.");
      const key = [
        target.source,
        target.sourceBrandId ?? sourceLabelKey(target.sourceBrand),
        target.sourceModelId ?? sourceLabelKey(target.sourceModel),
      ].join(":");
      if (targetKeys.has(key) || targetIds.has(target.id))
        fail("Critério remoto duplicado ou ambíguo.");
      targetKeys.add(key);
      targetIds.add(target.id);
    }
    const configurationsByModel = new Map(
      data.models.map((item) => [
        item.id,
        new Set(item.configurations?.map((configuration) => configuration.id)),
      ]),
    );
    const versions = new Set(data.versions.map((item) => item.id));
    for (const rows of [data.brands, data.models, data.versions]) {
      if (new Set(rows.map((item) => item.id)).size !== rows.length)
        fail("Identificador de catálogo duplicado.");
      const refs = new Set<string>();
      for (const item of rows)
        for (const ref of item.references) {
          if (!evidence.has(ref.evidenceId))
            fail("Correspondência sem evidência.");
          const scope =
            "brandId" in item
              ? item.brandId
              : "modelId" in item
                ? item.modelId
                : "";
          const key = `${scope}:${ref.source}:${ref.id}`;
          if (refs.has(key))
            fail("Identificador da fonte associado a mais de uma entidade.");
          refs.add(key);
        }
    }
    for (const model of data.models) {
      if (!brands.has(model.brandId)) fail("Modelo sem marca de catálogo.");
      if (model.references.some((ref) => ref.source === "fipe"))
        fail("Registro FIPE completo não é identidade de modelo.");
    }
    for (const version of data.versions)
      if (!models.has(version.modelId)) fail("Versão sem modelo de catálogo.");
    for (const model of data.models) {
      const configurations = model.configurations ?? [];
      if (
        new Set(configurations.map((item) => item.id)).size !==
        configurations.length
      )
        fail("Configuração do modelo duplicada.");
    }
    for (const alias of data.modelAliases ?? [])
      if (
        !models.has(alias.modelId) ||
        (alias.configurationId &&
          !configurationsByModel.get(alias.modelId)?.has(alias.configurationId))
      )
        fail("Alias sem modelo ou configuração correspondente.");
    for (const version of data.versions)
      if (
        version.configurationIds?.some(
          (id) => !configurationsByModel.get(version.modelId)?.has(id),
        )
      )
        fail("Versão com configuração de outro modelo.");
    for (const mapping of data.mappings) {
      if (mapping.canonicalBrandId && !brands.has(mapping.canonicalBrandId))
        fail("Correspondência aponta para marca inexistente.");
      if (mapping.canonicalModelId && !models.has(mapping.canonicalModelId))
        fail("Correspondência aponta para modelo inexistente.");
      if (
        mapping.notCanonicalModelId &&
        !models.has(mapping.notCanonicalModelId)
      )
        fail("Divergência aponta para modelo inexistente.");
      if (
        mapping.canonicalVersionId &&
        !versions.has(mapping.canonicalVersionId)
      )
        fail("Correspondência aponta para versão inexistente.");
      if (
        mapping.candidateVersionIds.some(
          (candidate) => !versions.has(candidate),
        )
      )
        fail("Pendência aponta para versão candidata inexistente.");
    }
  });
export type VehicleCatalog = z.infer<typeof catalogSchema>;
export const emptyCatalog: VehicleCatalog = {
  schemaVersion: 1,
  revision: "unconfigured",
  evidence: [],
  brands: [],
  models: [],
  versions: [],
  mappings: [],
};
export type CatalogEntity =
  | VehicleCatalog["brands"][number]
  | VehicleCatalog["models"][number]
  | VehicleCatalog["versions"][number];
export type CatalogOption = {
  code: string;
  name: string;
  provider?: "carrouter";
  revision?: string;
};
export const catalogOption = (
  entity: CatalogEntity,
  revision: string,
): CatalogOption => {
  const details =
    "engine" in entity && "transmission" in entity
      ? [entity.engine, entity.transmission].filter(Boolean).join(" · ")
      : "";
  return {
    code: entity.id,
    name: details ? `${entity.name} · ${details}` : entity.name,
    ...(details ? { searchName: entity.name } : {}),
    provider: "carrouter",
    revision,
  };
};

/** Legacy text remains text, never a fabricated catalog identity. */
export const catalogBrandSearchName = (value: string) =>
  value.trim().replace(/\s+/g, " ");

export type CatalogIdentity = {
  brandId: string;
  modelId?: string;
  versionId?: string;
  configurationId?: string;
};
export type SourceVehicle = {
  source: "olx" | "webmotors";
  brand: string | null;
  model: string | null;
  version?: string | null;
  brandId?: string | null;
  modelId?: string | null;
  versionId?: string | null;
  doors?: number | null;
};
function resolve<T extends CatalogEntity>(
  rows: T[],
  source: SourceVehicle["source"],
  sourceId: string | null | undefined,
  label: string | null | undefined,
) {
  const matches = rows.filter((entity) =>
    entity.references.some(
      (ref) =>
        ref.source === source &&
        (sourceId
          ? ref.id === sourceId
          : !!label &&
            [ref.name, ...ref.aliases].some(
              (value) => catalogKey(value) === catalogKey(label),
            )),
    ),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
const same = (
  left: string | null | undefined,
  right: string | null | undefined,
) => !!left && !!right && catalogKey(left) === catalogKey(right);
function mappingMatches(
  mapping: VehicleCatalog["mappings"][number],
  row: SourceVehicle,
) {
  if (mapping.source !== row.source) return false;
  if (
    mapping.sourceBrandId &&
    (!row.brandId || mapping.sourceBrandId !== row.brandId)
  )
    return false;
  if (
    !mapping.sourceBrandId &&
    mapping.sourceBrand &&
    !same(mapping.sourceBrand, row.brand)
  )
    return false;
  if (
    mapping.sourceModelId &&
    (!row.modelId || mapping.sourceModelId !== row.modelId)
  )
    return false;
  if (
    !mapping.sourceModelId &&
    mapping.sourceModelLabel &&
    !same(mapping.sourceModelLabel, row.model)
  )
    return false;
  if (
    mapping.level === "version" &&
    mapping.sourceVersionId &&
    (!row.versionId || mapping.sourceVersionId !== row.versionId)
  )
    return false;
  if (
    mapping.level === "version" &&
    !mapping.sourceVersionId &&
    mapping.sourceVersionLabel &&
    !same(mapping.sourceVersionLabel, row.version)
  )
    return false;
  return true;
}
export type CatalogResolutionStatus =
  "confirmed" | "divergent" | "pending" | "ambiguous" | "unresolved";
// Catalogs are immutable revision snapshots. Build these indexes once per snapshot,
// rather than scanning every model, alias and technical version for each listing.
function buildResolutionIndex(catalog: VehicleCatalog) {
  const modelsById = new Map(catalog.models.map((model) => [model.id, model]));
  const brandsById = new Map(catalog.brands.map((brand) => [brand.id, brand]));
  const modelsByBrand = new Map<string, VehicleCatalog["models"]>();
  const versionsByModel = new Map<string, VehicleCatalog["versions"]>();
  const versionsByBrand = new Map<string, VehicleCatalog["versions"]>();
  const labelsByBrand = new Map<
    string,
    Map<string, Set<VehicleCatalog["models"][number]>>
  >();
  const queryTargetsByBrand = new Map<string, CatalogQueryTarget[]>();
  const queryBrandIds = new Map<string, Set<string>>();
  const queryBrandLabels = new Map<string, Set<string>>();
  const aliasesByModel = new Map<
    string,
    NonNullable<VehicleCatalog["modelAliases"]>
  >();
  const append = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const rows = map.get(key);
    if (rows) rows.push(value);
    else map.set(key, [value]);
  };
  const label = (model: VehicleCatalog["models"][number], name: string) => {
    let labels = labelsByBrand.get(model.brandId);
    if (!labels) labelsByBrand.set(model.brandId, (labels = new Map()));
    const key = catalogKey(name);
    let matches = labels.get(key);
    if (!matches) labels.set(key, (matches = new Set()));
    matches.add(model);
  };
  for (const model of catalog.models) {
    append(modelsByBrand, model.brandId, model);
    label(model, model.name);
  }
  for (const alias of catalog.modelAliases ?? []) {
    append(aliasesByModel, alias.modelId, alias);
    const model = modelsById.get(alias.modelId);
    if (model) label(model, alias.name);
  }
  for (const target of catalog.queryTargets ?? []) {
    append(
      queryTargetsByBrand,
      `${target.source}:${target.canonicalBrandId}`,
      target,
    );
    const keys = [
      [queryBrandLabels, `${target.source}:${catalogKey(target.sourceBrand)}`],
    ] as [Map<string, Set<string>>, string][];
    if (target.sourceBrandId)
      keys.push([queryBrandIds, `${target.source}:${target.sourceBrandId}`]);
    for (const [map, key] of keys) {
      const values = map.get(key) ?? new Set<string>();
      values.add(target.canonicalBrandId);
      map.set(key, values);
    }
  }
  for (const version of catalog.versions) {
    append(versionsByModel, version.modelId, version);
    const model = modelsById.get(version.modelId);
    if (model) append(versionsByBrand, model.brandId, version);
  }
  return {
    modelsById,
    brandsById,
    modelsByBrand,
    versionsByModel,
    versionsByBrand,
    labelsByBrand,
    aliasesByModel,
    queryTargetsByBrand,
    queryBrandIds,
    queryBrandLabels,
  };
}
const resolutionIndexes = new WeakMap<
  VehicleCatalog,
  ReturnType<typeof buildResolutionIndex>
>();
function resolutionIndex(catalog: VehicleCatalog) {
  let index = resolutionIndexes.get(catalog);
  if (!index)
    resolutionIndexes.set(catalog, (index = buildResolutionIndex(catalog)));
  return index;
}

/** Resolve IDs first. Full source descriptions are joined only through explicit catalog records. */
export function resolveCatalogVehicle(
  catalog: VehicleCatalog,
  row: SourceVehicle,
) {
  const index = resolutionIndex(catalog);
  let brand = resolve(catalog.brands, row.source, row.brandId, row.brand);
  if (!brand) {
    const ids = row.brandId
      ? index.queryBrandIds.get(`${row.source}:${row.brandId}`)
      : undefined;
    const labels = row.brand
      ? index.queryBrandLabels.get(`${row.source}:${catalogKey(row.brand)}`)
      : undefined;
    const candidates = [...(ids?.size ? ids : (labels ?? []))].filter((id) => {
      const candidate = index.brandsById.get(id);
      const known =
        candidate?.references.filter((ref) => ref.source === row.source) ?? [];
      const targets =
        index.queryTargetsByBrand.get(`${row.source}:${id}`) ?? [];
      const knownIds = new Set([
        ...known.map((ref) => ref.id),
        ...targets.flatMap((target) =>
          target.sourceBrandId ? [target.sourceBrandId] : [],
        ),
      ]);
      return !row.brandId || !knownIds.size || knownIds.has(row.brandId);
    });
    if (candidates.length === 1) brand = index.brandsById.get(candidates[0]);
  }
  let models = brand ? (index.modelsByBrand.get(brand!.id) ?? []) : [];
  let model = resolve(models, row.source, row.modelId, row.model);
  const modelMappings = catalog.mappings.filter(
    (mapping) => mapping.level === "model" && mappingMatches(mapping, row),
  );
  const confirmedModelIds = [
    ...new Set(
      modelMappings
        .filter((mapping) => mapping.status === "confirmed")
        .map((mapping) => mapping.canonicalModelId)
        .filter((value): value is string => !!value),
    ),
  ];
  const nativeTargets = brand
    ? (index.queryTargetsByBrand.get(`${row.source}:${brand.id}`) ?? [])
    : [];
  const nativeIdMatches = row.modelId
    ? nativeTargets.filter((target) => target.sourceModelId === row.modelId)
    : [];
  const nativeCandidates = nativeIdMatches.length
    ? nativeIdMatches
    : !model && !modelMappings.length && row.model
      ? nativeTargets.filter((target) => {
          if (
            !same(target.sourceModel, row.model) ||
            (row.modelId && target.sourceModelId)
          )
            return false;
          const candidate = index.modelsById.get(target.canonicalModelId);
          const knownIds = [
            ...(candidate?.references
              .filter(
                (ref) =>
                  ref.source === row.source &&
                  [ref.name, ...ref.aliases].some((label) =>
                    same(label, target.sourceModel),
                  ),
              )
              .map((ref) => ref.id) ?? []),
            ...catalog.mappings
              .filter(
                (mapping) =>
                  mapping.source === row.source &&
                  mapping.canonicalModelId === target.canonicalModelId &&
                  (!mapping.sourceModelLabel ||
                    same(mapping.sourceModelLabel, target.sourceModel)) &&
                  mapping.sourceModelId,
              )
              .map((mapping) => mapping.sourceModelId!),
          ];
          return (
            !row.modelId || !knownIds.length || knownIds.includes(row.modelId)
          );
        })
      : [];
  const nativeModelIds = [
    ...new Set(nativeCandidates.map((target) => target.canonicalModelId)),
  ];
  if (nativeModelIds.length === 1 && (!model || nativeIdMatches.length))
    model = index.modelsById.get(nativeModelIds[0]);
  // A literal structured model label can identify a commercial family only
  // when no established source-ID binding or competing reference contradicts it.
  // Complete unknown OLX descriptions are never split at a model prefix.
  if (
    !model &&
    (!row.modelId ||
      (!models.some((item) =>
        item.references.some((ref) => ref.source === row.source),
      ) &&
        !catalog.mappings.some(
          (mapping) =>
            mapping.source === row.source &&
            mapping.sourceModelId &&
            mapping.canonicalBrandId === brand?.id,
        ) &&
        !nativeTargets.some((target) => target.sourceModelId))) &&
    !modelMappings.length &&
    catalog.commercialRevision &&
    row.brand &&
    row.model
  ) {
    const scopedBrand = catalog.brands.filter(
      (item) =>
        same(item.name, row.brand) &&
        (!row.brandId ||
          !item.references.some((ref) => ref.source === row.source)),
    );
    const directBrand =
      brand ?? (scopedBrand.length === 1 ? scopedBrand[0] : undefined);
    if (directBrand) {
      const directModels = [
        ...(index.labelsByBrand
          .get(directBrand.id)
          ?.get(catalogKey(row.model)) ?? []),
      ];
      const referenced = (index.modelsByBrand.get(directBrand.id) ?? []).filter(
        (item) =>
          item.references.some(
            (ref) =>
              ref.source === row.source &&
              [ref.name, ...ref.aliases].some((label) =>
                same(label, row.model),
              ),
          ),
      );
      if (directModels.length === 1 && referenced.length <= 1) {
        brand = directBrand;
        models = index.modelsByBrand.get(brand!.id) ?? [];
        model = directModels[0];
      }
    }
  }
  let modelStatus: CatalogResolutionStatus = model ? "confirmed" : "unresolved";
  let targetModelId: string | undefined;
  if (!model && confirmedModelIds.length === 1) {
    model = index.modelsById.get(confirmedModelIds[0]);
    const mappedModel = model;
    brand = mappedModel ? index.brandsById.get(mappedModel.brandId) : undefined;
    models = brand ? (index.modelsByBrand.get(brand!.id) ?? []) : [];
    modelStatus = model && brand ? "confirmed" : "unresolved";
  } else if (!model && confirmedModelIds.length > 1) modelStatus = "ambiguous";
  if (!model) {
    const negativeTargets = [
      ...new Set(
        modelMappings
          .filter((mapping) => mapping.status === "divergent")
          .map((mapping) => mapping.notCanonicalModelId)
          .filter((value): value is string => !!value),
      ),
    ];
    if (negativeTargets.length === 1) {
      modelStatus = "divergent";
      targetModelId = negativeTargets[0];
      const target = index.modelsById.get(targetModelId);
      if (target) brand = index.brandsById.get(target.brandId);
    } else if (negativeTargets.length > 1) modelStatus = "ambiguous";
    else if (modelMappings.some((mapping) => mapping.status === "pending"))
      modelStatus = "pending";
  }
  const versions = models.length
    ? (index.versionsByBrand.get(models[0].brandId) ?? [])
    : [];
  let version = resolve(
    model ? (index.versionsByModel.get(model.id) ?? []) : versions,
    row.source,
    row.versionId,
    row.version ?? (row.source === "olx" ? row.model : null),
  );
  if (!model && !row.modelId && version)
    model = models.find(
      (item) =>
        item.id === (version as VehicleCatalog["versions"][number]).modelId,
    );
  const versionMappings = catalog.mappings.filter(
    (mapping) => mapping.level === "version" && mappingMatches(mapping, row),
  );
  let versionStatus: CatalogResolutionStatus = version
    ? "confirmed"
    : row.version || row.versionId
      ? "unresolved"
      : "unresolved";
  if (!version && model) {
    const confirmedVersionIds = [
      ...new Set(
        versionMappings
          .filter((mapping) => mapping.status === "confirmed")
          .map((mapping) => mapping.canonicalVersionId)
          .filter((value): value is string => !!value),
      ),
    ];
    if (confirmedVersionIds.length === 1) {
      version = catalog.versions.find(
        (item) =>
          item.id === confirmedVersionIds[0] && item.modelId === model?.id,
      );
      versionStatus = version ? "confirmed" : "unresolved";
    } else if (confirmedVersionIds.length > 1) versionStatus = "ambiguous";
    else if (versionMappings.some((mapping) => mapping.status === "pending"))
      versionStatus = "pending";
  }
  const approvedModelMappings = modelMappings.filter(
    (item) =>
      item.status === "confirmed" && item.canonicalModelId === model?.id,
  );
  const mappedDoors = [
    ...new Set(
      approvedModelMappings
        .map((item) => item.doors)
        .filter((value): value is number => !!value),
    ),
  ];
  const doors =
    row.doors ?? (mappedDoors.length === 1 ? mappedDoors[0] : undefined);
  const configurationIds = [
    ...new Set(
      approvedModelMappings
        .map((item) => item.configurationId)
        .filter((value): value is string => !!value),
    ),
  ];
  const literalConfiguration = !row.modelId
    ? (model ? index.aliasesByModel.get(model.id) : undefined)?.find((alias) =>
        same(alias.name, row.model),
      )?.configurationId
    : undefined;
  const configuration = literalConfiguration
    ? model?.configurations?.find((item) => item.id === literalConfiguration)
    : configurationIds.length === 1
      ? model?.configurations?.find((item) => item.id === configurationIds[0])
      : model?.configurations?.find((item) => !!doors && item.doors === doors);
  return {
    brand,
    model,
    version,
    doors: doors ?? configuration?.doors,
    identity: brand
      ? {
          brandId: brand.id,
          ...(model ? { modelId: model.id } : {}),
          ...(version && model ? { versionId: version.id } : {}),
          ...(configuration && model
            ? { configurationId: configuration.id }
            : {}),
        }
      : undefined,
    classification: {
      model: modelStatus,
      version: versionStatus,
      ...(targetModelId ? { targetModelId } : {}),
    },
  };
}
export function sourceCatalogName(
  entity: CatalogEntity | undefined,
  source: SourceVehicle["source"],
) {
  const references = entity?.references.filter((ref) => ref.source === source);
  // Sending one arbitrary filter would hide the other source identities.
  return references?.length === 1 ? references[0].name : undefined;
}
export function parseCatalogCities(value: unknown): CatalogOption[] {
  const rows = z
    .array(
      z.object({
        id: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
        nome: name,
      }),
    )
    .parse(value);
  return [
    ...new Map(
      rows.map((item) => [
        String(item.id),
        { code: String(item.id), name: item.nome },
      ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
