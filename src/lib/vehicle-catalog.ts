import { z } from "zod";

/** Identity normalization only. No model/trim names or text-cutting rules. */
export const catalogKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1.")
    .replace(/[^a-z0-9.+]+/g, "");
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
  })
  .superRefine((data, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const evidence = new Set(data.evidence.map((item) => item.id));
    if (evidence.size !== data.evidence.length)
      fail("Identificador de evidência duplicado.");
    const brands = new Set(data.brands.map((item) => item.id));
    const models = new Set(data.models.map((item) => item.id));
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
          !data.models
            .find((item) => item.id === alias.modelId)
            ?.configurations?.some((item) => item.id === alias.configurationId))
      )
        fail("Alias sem modelo ou configuração correspondente.");
    for (const version of data.versions)
      if (
        version.configurationIds?.some(
          (id) =>
            !data.models
              .find((item) => item.id === version.modelId)
              ?.configurations?.some((item) => item.id === id),
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
        !data.versions.some((item) => item.id === mapping.canonicalVersionId)
      )
        fail("Correspondência aponta para versão inexistente.");
      if (
        mapping.candidateVersionIds.some(
          (candidate) => !data.versions.some((item) => item.id === candidate),
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
/** Resolve IDs first. Full source descriptions are joined only through explicit catalog records. */
export function resolveCatalogVehicle(
  catalog: VehicleCatalog,
  row: SourceVehicle,
) {
  let brand = resolve(catalog.brands, row.source, row.brandId, row.brand);
  let models = brand
    ? catalog.models.filter((item) => item.brandId === brand!.id)
    : [];
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
        ))) &&
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
      const directModels = catalog.models.filter(
        (item) =>
          item.brandId === directBrand.id &&
          (same(item.name, row.model) ||
            catalog.modelAliases?.some(
              (alias) =>
                alias.modelId === item.id && same(alias.name, row.model),
            )),
      );
      const referenced = catalog.models.filter(
        (item) =>
          item.brandId === directBrand.id &&
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
        models = catalog.models.filter((item) => item.brandId === brand!.id);
        model = directModels[0];
      }
    }
  }
  let modelStatus: CatalogResolutionStatus = model ? "confirmed" : "unresolved";
  let targetModelId: string | undefined;
  if (!model && confirmedModelIds.length === 1) {
    model = catalog.models.find((item) => item.id === confirmedModelIds[0]);
    const mappedModel = model;
    brand = mappedModel
      ? catalog.brands.find((item) => item.id === mappedModel.brandId)
      : undefined;
    models = brand
      ? catalog.models.filter((item) => item.brandId === brand!.id)
      : [];
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
      const target = catalog.models.find((item) => item.id === targetModelId);
      if (target)
        brand = catalog.brands.find((item) => item.id === target.brandId);
    } else if (negativeTargets.length > 1) modelStatus = "ambiguous";
    else if (modelMappings.some((mapping) => mapping.status === "pending"))
      modelStatus = "pending";
  }
  const versions = catalog.versions.filter((item) =>
    models.some((parent) => parent.id === item.modelId),
  );
  let version = resolve(
    model ? versions.filter((item) => item.modelId === model?.id) : versions,
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
    ? catalog.modelAliases?.find(
        (alias) => alias.modelId === model?.id && same(alias.name, row.model),
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
