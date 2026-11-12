import type { Listing } from "./discovery";
export type SavedListingSort = "recent" | "price" | "price-desc";
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
export function savedListingsView(
  rows: Listing[],
  query: string,
  sort: SavedListingSort,
) {
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  return rows
    .filter((row) => {
      const text = normalized(
        [
          row.title,
          row.brand,
          row.model,
          row.version,
          row.city,
          row.state,
          row.source,
        ]
          .filter(Boolean)
          .join(" "),
      );
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => {
      if (sort !== "recent") {
        if (a.priceCents === null) return b.priceCents === null ? 0 : 1;
        if (b.priceCents === null) return -1;
        return sort === "price"
          ? a.priceCents - b.priceCents
          : b.priceCents - a.priceCents;
      }
      return (Date.parse(b.observedAt) || 0) - (Date.parse(a.observedAt) || 0);
    });
}
