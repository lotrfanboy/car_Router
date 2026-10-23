import { z } from "zod";
import { commercialModelName } from "./commercial-names";

z.config(z.locales.pt());

export const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
export const fuels = [
  "Flex",
  "Gasolina",
  "Etanol",
  "Diesel",
  "Elétrico",
  "Híbrido",
  "GNV",
];
export const transmissions = ["Manual", "Automático", "Automatizado", "CVT"];
export const sellerTypes = ["Particular", "Loja", "Concessionária"];
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const url = z
  .union([
    z.literal(""),
    z
      .url()
      .max(2048)
      .refine(
        (v) => ["http:", "https:"].includes(new URL(v).protocol),
        "Use uma URL http ou https.",
      ),
  ])
  .optional()
  .nullable()
  .transform((v) => v || null);
const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
export const vehicleSchema = z
  .object({
    brand: z.string().trim().min(1, "Informe a marca.").max(80),
    model: z.string().trim().min(1, "Informe o modelo.").max(100),
    version: optionalText(150),
    manufactureYear: integer(1900, new Date().getFullYear() + 1),
    modelYear: integer(1900, new Date().getFullYear() + 2),
    mileage: integer(0, 10000000),
    priceCents: integer(1, 2000000000),
    referenceCents: integer(1, 2000000000)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    city: optionalText(120),
    state: z
      .union([z.literal(""), z.enum(states as [string, ...string[]])])
      .nullable()
      .optional()
      .transform((v) => v || null),
    fuel: z
      .union([z.literal(""), z.enum(fuels as [string, ...string[]])])
      .nullable()
      .optional()
      .transform((v) => v || null),
    transmission: z
      .union([z.literal(""), z.enum(transmissions as [string, ...string[]])])
      .nullable()
      .optional()
      .transform((v) => v || null),
    source: z.string().trim().min(1, "Informe a origem.").max(100),
    sellerType: z
      .union([z.literal(""), z.enum(sellerTypes as [string, ...string[]])])
      .nullable()
      .optional()
      .transform((v) => v || null),
    originalUrl: url,
    imageUrl: url,
    notes: optionalText(5000),
  })
  .refine((v) => v.modelYear >= v.manufactureYear, {
    message: "O ano do modelo não pode ser anterior à fabricação.",
    path: ["modelYear"],
  });

export type VehicleInput = z.infer<typeof vehicleSchema>;
export type PriceObservation = {
  id?: number;
  priceCents: number;
  observedAt: string;
  reason?: string;
};
export type Vehicle = VehicleInput & {
  id: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  /** Dates of actual price records. updatedAt also changes on favorite actions. */
  priceRecordedAt?: string | null;
  priceHistory?: PriceObservation[];
};
export function opportunity(price: number, reference?: number | null) {
  if (!reference || reference <= 0) return null;
  const difference = price - reference;
  return { difference, percentage: (difference / reference) * 100 };
}
export const money = (cents?: number | null) =>
  cents == null
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      }).format(cents / 100);
export const number = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
export const location = (v: Vehicle) =>
  [v.city, v.state].filter(Boolean).join(", ") || "Local não informado";
export type Filters = {
  q: string;
  brand: string;
  model: string;
  yearMin: string;
  yearMax: string;
  priceMin: string;
  priceMax: string;
  mileageMax: string;
  state: string;
  city: string;
  source: string;
  favorite: boolean;
  sort: string;
  version: string;
  fuel: string;
  transmission: string;
  manufactureYear: string;
  days: string;
  reduced: boolean;
  referenceDiscountMin: string;
  classification: string;
  exactMatch: boolean;
};
export const defaultFilters: Filters = {
  q: "",
  brand: "",
  model: "",
  yearMin: "",
  yearMax: "",
  priceMin: "",
  priceMax: "",
  mileageMax: "",
  state: "",
  city: "",
  source: "",
  favorite: false,
  sort: "recent",
  version: "",
  fuel: "",
  transmission: "",
  manufactureYear: "",
  days: "",
  reduced: false,
  referenceDiscountMin: "",
  classification: "",
  exactMatch: false,
};
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
export function filterVehicles(
  vehicles: Vehicle[],
  f: Filters,
  now = Date.now(),
) {
  const includes = (value: string | null | undefined, search: string) =>
    normalize(value ?? "").includes(normalize(search.trim()));
  const matches = (value: string | null | undefined, search: string) =>
    !search.trim() ||
    (f.exactMatch
      ? normalize(value ?? "").trim() === normalize(search).trim()
      : includes(value, search));
  return vehicles
    .filter(
      (v) =>
        includes(
          [v.brand, v.model, v.version, v.city, v.source].join(" "),
          f.q,
        ) &&
        matches(v.brand, f.brand) &&
        (matches(v.model, f.model) ||
          (f.model === commercialModelName(v.brand, f.model) &&
            matches(commercialModelName(v.brand, v.model), f.model))) &&
        matches(v.version, f.version || "") &&
        (!f.fuel || v.fuel === f.fuel) &&
        (!f.transmission || v.transmission === f.transmission) &&
        (!f.manufactureYear ||
          v.manufactureYear === Number(f.manufactureYear)) &&
        (!f.yearMin || v.modelYear >= Number(f.yearMin)) &&
        (!f.yearMax || v.modelYear <= Number(f.yearMax)) &&
        (!f.priceMin || v.priceCents >= Math.round(Number(f.priceMin) * 100)) &&
        (!f.priceMax || v.priceCents <= Math.round(Number(f.priceMax) * 100)) &&
        (!f.mileageMax || v.mileage <= Number(f.mileageMax)) &&
        (!f.state || v.state === f.state) &&
        includes(v.city, f.city) &&
        matches(v.source, f.source) &&
        (!f.days ||
          (Number.isFinite(Date.parse(v.createdAt)) &&
            Date.parse(v.createdAt) <= now &&
            now - Date.parse(v.createdAt) <= Number(f.days) * 86400000)) &&
        (!f.referenceDiscountMin ||
          (v.referenceCents != null &&
            v.referenceCents > 0 &&
            ((v.referenceCents - v.priceCents) / v.referenceCents) * 100 >=
              Number(f.referenceDiscountMin))) &&
        (!f.favorite || v.favorite),
    )
    .sort((a, b) => {
      switch (f.sort) {
        case "priceAsc":
          return a.priceCents - b.priceCents;
        case "priceDesc":
          return b.priceCents - a.priceCents;
        case "mileage":
          return a.mileage - b.mileage;
        case "year":
          return b.modelYear - a.modelYear;
        case "referenceDiscount": {
          const aDiscount = a.referenceCents
            ? (a.referenceCents - a.priceCents) / a.referenceCents
            : -Infinity;
          const bDiscount = b.referenceCents
            ? (b.referenceCents - b.priceCents) / b.referenceCents
            : -Infinity;
          return bDiscount - aDiscount || a.id.localeCompare(b.id);
        }
        default:
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      }
    });
}
