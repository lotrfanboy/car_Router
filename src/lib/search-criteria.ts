import type { SearchCriteria } from "./discovery";

type CanonicalSelection = Extract<
  NonNullable<SearchCriteria["catalog"]>,
  { provider: "carrouter" }
>;
type LegacySelection = Extract<
  NonNullable<SearchCriteria["catalog"]>,
  { provider: "fipe" }
>;

/** Only criteria that define a collection, independent of grid facets. */
export type CollectionCriteria = Omit<
  SearchCriteria,
  "version" | "doors" | "catalog"
> & {
  catalog?:
    | Omit<
        CanonicalSelection,
        | "versionCode"
        | "versionName"
        | "configurationCode"
        | "configurationName"
      >
    | LegacySelection;
};

/** Historical selectors and URLs must not silently narrow a new collection. */
export function collectionCriteria(
  criteria: SearchCriteria,
): CollectionCriteria {
  const result = { ...criteria, olxUrl: "" };
  delete result.version;
  delete result.doors;
  if (result.catalog?.provider === "carrouter") {
    result.catalog = { ...result.catalog };
    delete result.catalog.versionCode;
    delete result.catalog.versionName;
    delete result.catalog.configurationCode;
    delete result.catalog.configurationName;
  }
  return result;
}
