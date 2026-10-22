import { z } from "zod";
import { states } from "./vehicle";
import {
  catalogKey,
  type CatalogIdentity,
  type CatalogResolutionStatus,
} from "./vehicle-catalog";

export const sourceNames = { olx: "OLX", webmotors: "Webmotors" };
export type Source = keyof typeof sourceNames;
export const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const canonicalBrand = catalogKey;
export const canonicalModel = catalogKey;
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
    version: z.string().trim().max(200).optional(),
    // FIPE provenance is separate from the textual query and source attributes.
    // A family selection has a brand identity but no fabricated FIPE model ID.
    catalog: z
      .union([
        z
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
          ),
        z
          .object({
            provider: z.literal("carrouter"),
            revision: z.string().min(1).max(240),
            brandCode: z.string().min(1).max(240),
            brandName: z.string().min(1).max(240),
            modelCode: z.string().min(1).max(240).optional(),
            modelName: z.string().min(1).max(240).optional(),
            versionCode: z.string().min(1).max(240).optional(),
            versionName: z.string().min(1).max(240).optional(),
          })
          .superRefine((value, ctx) => {
            if (
              Boolean(value.modelCode) !== Boolean(value.modelName) ||
              Boolean(value.versionCode) !== Boolean(value.versionName) ||
              (value.versionCode && !value.modelCode)
            )
              ctx.addIssue({
                code: "custom",
                message: "Identidade de catálogo incompleta.",
              });
          }),
      ])
      .optional(),
    locationMode: z.enum(["cities", "state"]).optional(),
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
  })
  .transform((value) => {
    const cities =
      value.locationMode === "state"
        ? []
        : value.cities.length
          ? value.cities
          : value.city
            ? [value.city]
            : [];
    return {
      ...value,
      cities,
      city: cities[0] ?? "",
      locationMode: cities.length ? ("cities" as const) : ("state" as const),
    };
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
  identity?: CatalogIdentity;
  catalogResolution?: {
    model: CatalogResolutionStatus;
    version: CatalogResolutionStatus;
    targetModelId?: string;
  };
  sourceIdentity?: {
    brandId: string | null;
    modelId: string | null;
    versionId: string | null;
  };
  original?: {
    brand: string | null;
    model: string | null;
    version: string | null;
    properties?: unknown[];
    fields?: Record<string, unknown>;
  };
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
  applied?: { remote: string[]; local: string[] };
  received?: number;
  normalizationDiscards?: Record<string, number>;
  listings: Listing[];
};
export type SearchResult = { sources: SourceResult[] };

export function eligibility(row: Listing, s: SearchCriteria) {
  const reasons: string[] = [];
  const selected = s.catalog?.provider === "carrouter" ? s.catalog : undefined;
  const brandMatches = selected
    ? row.identity?.brandId === selected.brandCode
    : !!row.brand && canonicalBrand(row.brand) === canonicalBrand(s.brand);
  if (!brandMatches) reasons.push("Marca diferente ou desconhecida");
  const modelMatches = selected?.modelCode
    ? row.identity?.modelId === selected.modelCode
    : !!row.model && canonicalModel(row.model) === canonicalModel(s.model);
  if (!modelMatches) {
    const resolution = row.catalogResolution;
    if (
      selected?.modelCode &&
      resolution?.model === "divergent" &&
      resolution.targetModelId === selected.modelCode
    )
      reasons.push("Modelo comprovadamente diferente");
    else if (
      selected?.modelCode &&
      resolution?.model === "confirmed" &&
      !!row.identity?.modelId
    )
      reasons.push("Modelo comprovadamente diferente");
    else if (resolution?.model === "pending")
      reasons.push("Modelo com correspondência pendente");
    else if (resolution?.model === "ambiguous")
      reasons.push("Modelo com correspondência ambígua");
    else if (selected?.modelCode) reasons.push("Modelo não classificado");
    else reasons.push("Modelo diferente ou não confirmado");
  }
  const versionMatches = selected?.versionCode
    ? row.identity?.versionId === selected.versionCode
    : !!row.version &&
      (catalogKey(row.version) === catalogKey(s.version ?? "") ||
        ` ${normalized(row.version)} `.includes(
          ` ${normalized(s.version ?? "")} `,
        ));
  if (s.version && !versionMatches) {
    const status = row.catalogResolution?.version;
    if (
      selected?.versionCode &&
      status === "confirmed" &&
      !!row.identity?.versionId
    )
      reasons.push("Versão comprovadamente diferente");
    else if (status === "pending")
      reasons.push("Versão com correspondência pendente");
    else if (status === "ambiguous")
      reasons.push("Versão com correspondência ambígua");
    else if (selected?.versionCode) reasons.push("Versão não classificada");
    else reasons.push("Versão diferente ou desconhecida");
  }
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
