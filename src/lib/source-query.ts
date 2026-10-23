import type { SearchCriteria, Source } from "./discovery";
import {
  catalogKey,
  type CatalogQueryTarget,
  type VehicleCatalog,
} from "./vehicle-catalog";
import {
  normalizeCatalogCriteria,
  validCatalogCriteria,
} from "./commercial-models";
import { collectionCriteria, type CollectionCriteria } from "./search-criteria";

export type SourceQueryMapping = {
  status: "confirmed" | "uncertain" | "incompatible";
  message: string;
};
export type SourceQueryPlan = {
  /** Canonical selection used to classify the union of received listings. */
  criteria: CollectionCriteria;
  /** Compatibility with single-target consumers; execution must use queries. */
  query: CollectionCriteria | null;
  queries: CollectionCriteria[];
  /** Versions are display facets. No provider receives a trim filter. */
  trim?: never;
  mapping: SourceQueryMapping;
};

const familyKey = (source: Source, brand: string, model: string) =>
  JSON.stringify([source, brand, model]);
const manualKey = (source: Source, brand: string, model: string) =>
  familyKey(source, catalogKey(brand), catalogKey(model));
type QueryIndex = {
  brands: VehicleCatalog["brands"];
  models: VehicleCatalog["models"];
  targets: VehicleCatalog["queryTargets"];
  sizes: string;
  brandsById: Map<string, VehicleCatalog["brands"][number]>;
  modelsById: Map<string, VehicleCatalog["models"][number]>;
  families: Map<string, CatalogQueryTarget[]>;
  manual: Map<string, CatalogQueryTarget[]>;
};
const queryIndexes = new WeakMap<VehicleCatalog, QueryIndex>();

/** Catalog snapshots are immutable; replacements get independent indexes. */
function queryIndex(catalog: VehicleCatalog): QueryIndex {
  const sizes = `${catalog.brands.length}:${catalog.models.length}:${catalog.queryTargets?.length ?? 0}`;
  const cached = queryIndexes.get(catalog);
  if (
    cached &&
    cached.brands === catalog.brands &&
    cached.models === catalog.models &&
    cached.targets === catalog.queryTargets &&
    cached.sizes === sizes
  )
    return cached;
  const brandsById = new Map(catalog.brands.map((row) => [row.id, row]));
  const modelsById = new Map(catalog.models.map((row) => [row.id, row]));
  const families = new Map<string, CatalogQueryTarget[]>();
  const manual = new Map<string, CatalogQueryTarget[]>();
  const add = (
    map: Map<string, CatalogQueryTarget[]>,
    key: string,
    target: CatalogQueryTarget,
  ) => {
    const rows = map.get(key);
    if (rows) rows.push(target);
    else map.set(key, [target]);
  };
  for (const target of catalog.queryTargets ?? []) {
    if (target.status !== "confirmed") continue;
    const brand = brandsById.get(target.canonicalBrandId);
    const model = modelsById.get(target.canonicalModelId);
    if (!brand || !model || model.brandId !== brand.id) continue;
    add(families, familyKey(target.source, brand.id, model.id), target);
    const keys = new Set<string>();
    for (const brandName of [target.sourceBrand, brand.name])
      for (const modelName of [target.sourceModel, model.name])
        keys.add(manualKey(target.source, brandName, modelName));
    for (const key of keys) add(manual, key, target);
  }
  const index = {
    brands: catalog.brands,
    models: catalog.models,
    targets: catalog.queryTargets,
    sizes,
    brandsById,
    modelsById,
    families,
    manual,
  };
  queryIndexes.set(catalog, index);
  return index;
}

/**
 * Read mappings classify returned ads; only queryTargets authorize structured
 * outbound filters. OLX's documented keyword search has no exact-model contract.
 */
export function planSourceQuery(
  catalog: VehicleCatalog,
  source: Source,
  input: SearchCriteria,
): SourceQueryPlan {
  let criteria = collectionCriteria(normalizeCatalogCriteria(catalog, input));
  const selection =
    criteria.catalog?.provider === "carrouter" ? criteria.catalog : undefined;
  const selected = selection?.modelCode ? selection : undefined;
  const index = queryIndex(catalog);
  const brand = selection
    ? index.brandsById.get(selection.brandCode)
    : undefined;
  const selectedModel = selected
    ? index.modelsById.get(selected.modelCode!)
    : undefined;
  const model =
    selectedModel?.brandId === brand?.id ? selectedModel : undefined;
  const blocked = (message: string): SourceQueryPlan => ({
    criteria,
    query: null,
    queries: [],
    mapping: { status: "incompatible", message },
  });
  if (
    selection &&
    (!validCatalogCriteria(catalog, criteria) ||
      !brand ||
      selection.revision !== catalog.revision ||
      criteria.brand !== brand.name ||
      selection.brandName !== brand.name ||
      (selected &&
        (!model ||
          criteria.model !== model.name ||
          selected.modelName !== model.name)))
  )
    return blocked(
      "Catálogo com marca ou modelo desatualizado ou incompatível. Selecione marca e modelo novamente. Nenhuma coleta foi executada nesta fonte.",
    );

  if (source === "olx")
    return {
      criteria,
      query: criteria,
      queries: [criteria],
      mapping: {
        status: "uncertain",
        message:
          "Consulta OLX por texto de marca e modelo, sem filtro de versão. A fonte pode retornar outros modelos; os anúncios recebidos são classificados localmente. A consulta textual não comprova cobertura completa do modelo.",
      },
    };

  // Never infer outbound filters from references, returned-ad labels or trim IDs.
  let approved = selected
    ? (index.families.get(familyKey(source, brand!.id, model!.id)) ?? [])
    : (index.manual.get(manualKey(source, criteria.brand, criteria.model)) ??
      []);
  if (!approved.length)
    return blocked(
      "Consulta Webmotors pendente: não há vínculo de busca validado para esta marca e modelo. Nenhum crédito foi consumido nesta fonte; as outras fontes selecionadas podem continuar.",
    );

  // A manual input must uniquely identify an approved family, then collects all
  // its native models instead of silently retaining one arbitrary variant.
  if (!selected) {
    const families = new Set(approved.map((target) => target.canonicalModelId));
    if (families.size !== 1)
      return blocked(
        "Consulta Webmotors ambígua: este nome corresponde a mais de um modelo. Selecione marca e modelo no catálogo. Nenhum crédito foi consumido nesta fonte.",
      );
    const target = approved[0];
    const parent = index.brandsById.get(target.canonicalBrandId)!;
    const family = index.modelsById.get(target.canonicalModelId)!;
    criteria = {
      ...criteria,
      brand: parent.name,
      model: family.name,
      catalog: {
        provider: "carrouter",
        revision: catalog.revision,
        brandCode: parent.id,
        brandName: parent.name,
        modelCode: family.id,
        modelName: family.name,
      },
    };
    approved =
      index.families.get(familyKey(source, parent.id, family.id)) ?? [];
  }
  const unique = new Map<string, (typeof approved)[number]>();
  for (const target of approved) {
    // Preserve punctuation and distinct native names as separate query targets.
    const key = JSON.stringify([
      target.sourceBrand.trim().toLocaleLowerCase("pt-BR"),
      target.sourceModel.trim().toLocaleLowerCase("pt-BR"),
    ]);
    if (!unique.has(key)) unique.set(key, target);
  }
  const queries = [...unique.values()].map((target) => ({
    ...criteria,
    brand: target.sourceBrand,
    model: target.sourceModel,
  }));
  return {
    criteria,
    query: queries[0],
    queries,
    mapping: {
      status: "confirmed",
      message:
        queries.length === 1
          ? "Marca e modelo traduzidos pelo catálogo de busca da Webmotors. A coleta inclui todas as versões retornadas; a cobertura depende das páginas recebidas."
          : `Família traduzida para ${queries.length} modelos da Webmotors. Os resultados são unidos sem restringir versão; a cobertura depende dos alvos e páginas recebidos.`,
    },
  };
}
