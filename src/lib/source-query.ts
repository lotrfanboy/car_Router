import type { SearchCriteria, Source } from "./discovery";
import type { CatalogEntity, VehicleCatalog } from "./vehicle-catalog";

export type SourceQueryMapping = {
  status: "confirmed" | "uncertain" | "incompatible";
  message: string;
};
export type SourceQueryPlan = {
  query: SearchCriteria | null;
  trim?: string;
  mapping: SourceQueryMapping;
};

// These are query labels, never external identities. Multiple approved labels
// must not be reduced to one arbitrary source variant.
function uniqueLabel(labels: (string | null | undefined)[]) {
  const values = new Set<string>();
  for (const label of labels) if (label?.trim()) values.add(label.trim());
  return values.size === 1 ? [...values][0] : undefined;
}
const referenceLabels = (entity: CatalogEntity | undefined, source: Source) =>
  entity?.references
    .filter((ref) => ref.source === source)
    .map((ref) => ref.name) ?? [];

/**
 * Plan with capabilities already used by these adapters: OLX accepts q text;
 * Reef accepts make/model names and a source-specific trim, not canonical IDs.
 * Missing crosswalks are uncertainty, not evidence that a vehicle is absent.
 */
export function planSourceQuery(
  catalog: VehicleCatalog,
  source: Source,
  criteria: SearchCriteria,
): SourceQueryPlan {
  const selected =
    criteria.catalog?.provider === "carrouter" ? criteria.catalog : undefined;
  const brand = catalog.brands.find((item) => item.id === selected?.brandCode);
  const model = catalog.models.find(
    (item) => item.id === selected?.modelCode && item.brandId === brand?.id,
  );
  const version = catalog.versions.find(
    (item) => item.id === selected?.versionCode && item.modelId === model?.id,
  );
  if (
    selected &&
    (!brand ||
      selected.revision !== catalog.revision ||
      criteria.brand !== brand.name ||
      selected.brandName !== brand.name ||
      (selected.modelCode &&
        (!model ||
          criteria.model !== model.name ||
          selected.modelName !== model.name)) ||
      (selected.versionCode &&
        (!version ||
          criteria.version !== version.name ||
          selected.versionName !== version.name)))
  )
    return {
      query: null,
      mapping: {
        status: "incompatible",
        message:
          "Catálogo com seleção desatualizada ou incompatível. Selecione marca, modelo e versão novamente. Nenhuma coleta foi executada nesta fonte.",
      },
    };

  const approved = catalog.mappings.filter(
    (mapping) =>
      mapping.source === source &&
      mapping.status === "confirmed" &&
      (!mapping.canonicalBrandId || mapping.canonicalBrandId === brand?.id),
  );
  const modelMappings = model
    ? approved.filter(
        (mapping) =>
          mapping.level === "model" && mapping.canonicalModelId === model.id,
      )
    : [];
  const versionMappings = version
    ? approved.filter(
        (mapping) =>
          mapping.level === "version" &&
          mapping.canonicalVersionId === version.id &&
          (!mapping.canonicalModelId || mapping.canonicalModelId === model?.id),
      )
    : [];
  const sourceBrand = uniqueLabel([
    ...referenceLabels(brand, source),
    ...modelMappings.map((mapping) => mapping.sourceBrand),
    ...versionMappings.map((mapping) => mapping.sourceBrand),
  ]);
  const sourceModel = uniqueLabel([
    ...referenceLabels(model, source),
    ...modelMappings.map((mapping) => mapping.sourceModelLabel),
    ...versionMappings.map((mapping) => mapping.sourceModelLabel),
  ]);
  const sourceVersion = uniqueLabel([
    ...referenceLabels(version, source),
    ...versionMappings.map((mapping) => mapping.sourceVersionLabel),
  ]);
  const translatedTrim = sourceBrand && sourceModel ? sourceVersion : undefined;
  const confirmed =
    !(source === "olx" && criteria.olxUrl) &&
    !!sourceBrand &&
    !!sourceModel &&
    (!criteria.version || !!sourceVersion);
  const versionMessage = criteria.version
    ? source === "olx"
      ? criteria.olxUrl
        ? " Versão preservada na conferência local; a URL salva mantém seus próprios filtros."
        : " Versão incluída no texto da busca e conferida localmente."
      : translatedTrim
        ? " Versão traduzida para o filtro trim e conferida localmente."
        : " Versão preservada na conferência local: sem tradução aprovada para trim, a coleta pode trazer outras versões."
    : "";
  return {
    query: {
      ...criteria,
      brand: sourceBrand ?? criteria.brand,
      model: sourceModel ?? criteria.model,
      version: sourceVersion ?? criteria.version,
    },
    ...(source === "webmotors" && criteria.version && translatedTrim
      ? { trim: translatedTrim }
      : {}),
    mapping: {
      status: confirmed ? "confirmed" : "uncertain",
      message:
        (source === "olx" && criteria.olxUrl
          ? "Consulta pela URL salva; os critérios selecionados são conferidos localmente."
          : confirmed
            ? "Termos traduzidos por correspondências aprovadas; os anúncios ainda passam pela conferência local."
            : source === "webmotors"
              ? "Consulta pelos nomes nos filtros make/model, que exigem a grafia da Webmotors. Sem tradução completa aprovada, um retorno vazio pode indicar diferença de nomes, não ausência do veículo. Resultados sem identidade confirmada ficam separados dos exatos."
              : "Consulta por nomes, sem correspondência completa aprovada na fonte. Resultados sem identidade confirmada ficam separados dos exatos.") +
        versionMessage,
    },
  };
}
