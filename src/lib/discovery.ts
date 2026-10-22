import { z } from "zod";
import { states } from "./vehicle";
import { catalogBrandSearchName } from "./vehicle-catalog";

export const sourceNames = { olx: "OLX", webmotors: "Webmotors" };
export type Source = keyof typeof sourceNames;
export const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const canonicalBrand = (value: string) => {
  const name = normalized(catalogBrandSearchName(value));
  return name === "mercedes" || name === "mercedes benz"
    ? "mercedes benz"
    : name;
};
export const canonicalModel = (value: string) =>
  normalized(value).replace(/^c 180\b/, "c180");
export function publicListingUrl(value: string, source: Source) {
  try {
    const url = new URL(value);
    const domain = source === "olx" ? "olx.com.br" : "webmotors.com.br";
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) &&
      (source === "olx"
        ? /\/autos-e-pecas\/carros-vans-e-utilitarios\//.test(url.pathname)
        : url.pathname.startsWith("/comprar/"))
    );
  } catch {
    return false;
  }
}
const optionalNumber = z.number().int().positive().max(10000000).nullable();
export const searchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    brand: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(200),
    version: z.string().trim().max(120).optional(),
    // FIPE provenance is separate from the textual query and source attributes.
    // A family selection has a brand identity but no fabricated FIPE model ID.
    catalog: z
      .object({
        provider: z.literal("fipe"),
        brandCode: z.string().regex(/^\d{1,4}$/),
        brandName: z.string().trim().min(1).max(100),
        // Local family-selector identity; never a FIPE model code or query term.
        modelGroup: z
          .string()
          .trim()
          .max(240)
          .regex(/^family:.+/)
          .optional(),
        modelCode: z
          .string()
          .regex(/^\d{1,10}$/)
          .optional(),
        modelName: z.string().trim().min(1).max(200).optional(),
      })
      .refine(
        (value) => Boolean(value.modelCode) === Boolean(value.modelName),
        {
          message: "Código e nome do catálogo devem ser informados juntos.",
        },
      )
      .optional(),
    locationMode: z.enum(["cities", "state"]).default("cities"),
    // `city` remains as the primary city for saved-search compatibility.
    city: z.string().trim().max(120).default(""),
    cities: z
      .array(z.string().trim().min(1).max(120))
      .max(12)
      .refine((items) => new Set(items.map(normalized)).size === items.length, {
        message: "Não repita cidades na mesma busca.",
      })
      .default([]),
    state: z.enum(states as [string, ...string[]]),
    yearMin: z.number().int().min(1900).max(2100).nullable(),
    yearMax: z.number().int().min(1900).max(2100).nullable(),
    priceMax: optionalNumber,
    mileageMax: z.number().int().min(0).max(10000000).nullable(),
    privateOnly: z.boolean(),
    sources: z
      .array(z.enum(["olx", "webmotors"]))
      .min(1)
      .max(2)
      .refine((x) => new Set(x).size === x.length),
    olxUrl: z.string().trim().max(2000).default(""),
  })
  .superRefine((s, ctx) => {
    const selectedCities = s.cities.length ? s.cities : s.city ? [s.city] : [];
    if (s.locationMode === "cities" && !selectedCities.length)
      ctx.addIssue({
        code: "custom",
        message: "Selecione ao menos uma cidade ou escolha o estado inteiro.",
        path: ["cities"],
      });
    if (s.yearMin && s.yearMax && s.yearMin > s.yearMax)
      ctx.addIssue({
        code: "custom",
        message: "Revise o intervalo dos anos.",
        path: ["yearMax"],
      });
    // Legacy saved URLs remain valid, but normal searches no longer require one.
    if (s.olxUrl) {
      try {
        const u = new URL(s.olxUrl);
        if (
          u.protocol !== "https:" ||
          u.hostname !== "www.olx.com.br" ||
          u.username ||
          u.password ||
          u.port ||
          !u.pathname.startsWith("/autos-e-pecas/carros-vans-e-utilitarios")
        )
          throw new Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Cole a URL pública da busca de carros em www.olx.com.br.",
          path: ["olxUrl"],
        });
      }
    }
  });
export type SearchCriteria = z.infer<typeof searchSchema>;
export function criteriaLocation(criteria: SearchCriteria) {
  if (criteria.locationMode === "state")
    return `todo o estado de ${criteria.state}`;
  const cities = criteria.cities.length
    ? criteria.cities
    : criteria.city
      ? [criteria.city]
      : [];
  return `${cities.join(", ")}/${criteria.state}`;
}
export type Listing = {
  source: Source;
  externalId: string;
  url: string;
  title: string;
  brand: string | null;
  model: string | null;
  /** Original model attribute from this source, not a catalog identity. */
  sourceModel?: string | null;
  version?: string | null;
  versionOrigin?: "explicit" | "inferred" | "unknown";
  fuel?: string | null;
  transmission?: string | null;
  engine?: string | null;
  imageUrl?: string | null;
  modelYear: number | null;
  priceCents: number | null;
  mileage: number | null;
  city: string | null;
  state: string | null;
  sellerType: "private" | "professional" | "unknown";
  observedAt: string;
  reasons: string[];
  isNew?: boolean;
  previousPriceCents?: number | null;
  saved?: boolean;
  comparison?: import("./listing-comparison").ListingComparison;
};
export type SourceResult = {
  source: Source;
  status: "ok" | "error" | "unconfigured";
  message: string;
  observedAt: string;
  elapsedMs: number;
  creditsReserved: number;
  locationCredits?: number;
  total: number | null;
  partial: boolean;
  listings: Listing[];
};
export type SearchResult = { sources: SourceResult[] };

export function eligibility(row: Listing, s: SearchCriteria) {
  const reasons: string[] = [];
  if (!row.brand || canonicalBrand(row.brand) !== canonicalBrand(s.brand))
    reasons.push("Marca diferente ou desconhecida");
  if (!row.model || canonicalModel(row.model) !== canonicalModel(s.model))
    reasons.push("Modelo diferente ou não confirmado");
  if (
    s.version &&
    (!row.version ||
      !` ${normalized(row.version)} `.includes(` ${normalized(s.version)} `))
  )
    reasons.push("Versão diferente ou desconhecida");
  const selectedCities = s.cities.length ? s.cities : s.city ? [s.city] : [];
  if (
    row.state !== s.state ||
    (s.locationMode === "cities" &&
      (!row.city ||
        !selectedCities.some(
          (city) => normalized(city) === normalized(row.city!),
        )))
  )
    reasons.push("Fora da abrangência selecionada ou localização desconhecida");
  if (
    (s.yearMin !== null || s.yearMax !== null) &&
    (row.modelYear === null ||
      (s.yearMin !== null && row.modelYear < s.yearMin) ||
      (s.yearMax !== null && row.modelYear > s.yearMax))
  )
    reasons.push("Ano fora do intervalo ou desconhecido");
  if (
    row.priceCents === null ||
    row.priceCents <= 0 ||
    (s.priceMax !== null && row.priceCents > s.priceMax * 100)
  )
    reasons.push("Preço fora do limite ou desconhecido");
  if (
    s.mileageMax !== null &&
    (row.mileage === null || row.mileage > s.mileageMax)
  )
    reasons.push("Quilometragem acima do limite ou desconhecida");
  if (s.privateOnly && row.sellerType !== "private")
    reasons.push("Particular não confirmado");
  return reasons;
}
