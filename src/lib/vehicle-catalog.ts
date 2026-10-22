import { z } from "zod";

/** Identity normalization only. No model/trim names or text-cutting rules. */
export const catalogKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1.")
    .replace(/[^a-z0-9.]+/g, "");
const id = z.string().trim().min(1).max(240);
const name = z.string().trim().min(1).max(240);
const reference = z.object({
  source: z.enum(["webmotors", "olx", "fipe"]),
  id,
  name,
  aliases: z.array(name).default([]),
  evidenceId: id,
});
const entity = z.object({ id, name, references: z.array(reference).min(1) });
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
    models: z.array(entity.extend({ brandId: id })),
    versions: z.array(entity.extend({ modelId: id })),
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
  });
export type VehicleCatalog = z.infer<typeof catalogSchema>;
export const emptyCatalog: VehicleCatalog = {
  schemaVersion: 1,
  revision: "unconfigured",
  evidence: [],
  brands: [],
  models: [],
  versions: [],
};
export type CatalogEntity = VehicleCatalog["brands"][number];
export type CatalogOption = {
  code: string;
  name: string;
  provider?: "carrouter";
  revision?: string;
};
export const catalogOption = (
  entity: CatalogEntity,
  revision: string,
): CatalogOption => ({
  code: entity.id,
  name: entity.name,
  provider: "carrouter",
  revision,
});

/** Legacy text remains text, never a fabricated catalog identity. */
export const catalogBrandSearchName = (value: string) =>
  value.trim().replace(/\s+/g, " ");

export type CatalogIdentity = {
  brandId: string;
  modelId?: string;
  versionId?: string;
};
export type SourceVehicle = {
  source: "olx" | "webmotors";
  brand: string | null;
  model: string | null;
  version?: string | null;
  brandId?: string | null;
  modelId?: string | null;
  versionId?: string | null;
};
function resolve(
  rows: CatalogEntity[],
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
/** Resolve IDs first. Full source descriptions are joined only through explicit catalog records. */
export function resolveCatalogVehicle(
  catalog: VehicleCatalog,
  row: SourceVehicle,
) {
  const brand = resolve(catalog.brands, row.source, row.brandId, row.brand);
  if (!brand) return null;
  const models = catalog.models.filter((item) => item.brandId === brand.id);
  let model = resolve(models, row.source, row.modelId, row.model);
  const versions = catalog.versions.filter((item) =>
    models.some((parent) => parent.id === item.modelId),
  );
  const version = resolve(
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
  return {
    brand,
    model,
    version,
    identity: {
      brandId: brand.id,
      ...(model ? { modelId: model.id } : {}),
      ...(version && model ? { versionId: version.id } : {}),
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
