import { normalized, type SearchCriteria } from "./discovery";
import { catalogBrandSearchName } from "./vehicle-catalog";
export const slug = (value: string) => normalized(value).replaceAll(" ", "-");
// Verified against OLX's public location selector; not an invented national directory.
export const verifiedRegions: Record<string, string> = {
  "SC:blumenau": "norte-de-santa-catarina",
  "PR:curitiba": "regiao-de-curitiba-e-paranagua",
};
export const locationKey = (criteria: Pick<SearchCriteria, "state" | "city">) =>
  `${criteria.state}:${slug(criteria.city)}`;
export function buildOlxUrl(criteria: SearchCriteria, region: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(region))
    throw new Error("Região OLX inválida.");
  // Curitiba's city selection resolves to the metropolitan-region URL, unlike Blumenau.
  const cityPath =
    locationKey(criteria) === "PR:curitiba" ? "" : `/${slug(criteria.city)}`;
  const url = new URL(
    `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-${criteria.state.toLowerCase()}/${region}${cityPath}`,
  );
  url.searchParams.set(
    "q",
    `${catalogBrandSearchName(criteria.brand)} ${criteria.model}`,
  );
  url.searchParams.set("sf", "1");
  if (criteria.priceMax !== null)
    url.searchParams.set("pe", String(criteria.priceMax));
  return url.toString();
}
export function regionCandidates(data: unknown): string[] {
  const rows =
    data && typeof data === "object" && "regions" in data ? data.regions : null;
  if (!Array.isArray(rows)) return [];
  return [
    ...new Set(
      rows.flatMap((row) =>
        row &&
        typeof row.slug === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)
          ? [row.slug]
          : [],
      ),
    ),
  ];
}
