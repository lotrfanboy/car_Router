import type { Listing } from "./discovery";

export const unknownVersionFacet = "unknown";
export type VersionFacet = { value: string; label: string; count: number };

// Presentation grouping only: this key never establishes a technical identity,
// changes a provider query, or decides whether two cars are comparable in price.
const labelKey = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-");
const label = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, " ") ?? "";

function versionPresentation(row: Listing) {
  const sourceDescription = label(row.original?.model ?? row.sourceModel);
  const explicitVersion = label(row.original?.version ?? row.version);
  const inferredDescription =
    row.source === "olx" &&
    (row.versionOrigin === "inferred" ||
      (!explicitVersion &&
        !!row.identity?.modelId &&
        !!sourceDescription &&
        labelKey(sourceDescription) !== labelKey(row.model ?? "")));
  const version = inferredDescription
    ? sourceDescription || explicitVersion
    : explicitVersion;
  if (!version) return { value: unknownVersionFacet, label: "Não informada" };
  const engine = label(row.engine);
  const transmission = label(row.transmission);
  const scope = [
    row.identity?.brandId ?? labelKey(row.brand ?? ""),
    row.identity?.modelId ?? labelKey(row.model ?? ""),
  ];
  const details = [engine, transmission].filter(
    (part) => part && !labelKey(version).includes(labelKey(part)),
  );
  const description = [version, ...details].join(" · ");
  return {
    value: JSON.stringify([
      ...scope,
      inferredDescription ? "olx-description" : "version",
      labelKey(description),
    ]),
    label: inferredDescription ? `${description} · descrição OLX` : description,
  };
}

/** Build facets from the complete collected result, before applying this facet. */
export function resultVersionFacets(rows: Listing[]): VersionFacet[] {
  const facets = new Map<string, VersionFacet & { scope: string }>();
  const seen = new Set<string>();
  for (const row of rows) {
    const id = `${row.source}:${row.externalId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const option = versionPresentation(row);
    const current = facets.get(option.value);
    if (current) current.count++;
    else
      facets.set(option.value, {
        ...option,
        count: 1,
        scope: [row.brand, row.model].filter(Boolean).join(" "),
      });
  }
  const options = [...facets.values()].sort((a, b) =>
    a.value === unknownVersionFacet
      ? 1
      : b.value === unknownVersionFacet
        ? -1
        : a.label.localeCompare(b.label, "pt-BR"),
  );
  // A same-looking version may belong to different models present in an
  // incompatible/uncertain result. Keep groups distinct and label the scope.
  const labels = new Map<string, number>();
  for (const option of options)
    labels.set(
      labelKey(option.label),
      (labels.get(labelKey(option.label)) ?? 0) + 1,
    );
  return options.map(({ scope, ...option }) =>
    (labels.get(labelKey(option.label)) ?? 0) <= 1
      ? option
      : { ...option, label: `${option.label} · ${scope}` },
  );
}

export function matchesResultVersion(row: Listing, selected: string) {
  return !selected || versionPresentation(row).value === selected;
}
