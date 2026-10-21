import { z } from "zod";

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
    originalUrl: url,
    imageUrl: url,
    notes: optionalText(5000),
  })
  .refine((v) => v.modelYear >= v.manufactureYear, {
    message: "O ano do modelo não pode ser anterior à fabricação.",
    path: ["modelYear"],
  });

export type VehicleInput = z.infer<typeof vehicleSchema>;
export type Vehicle = VehicleInput & {
  id: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
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
};
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function filterVehicles(vehicles: Vehicle[], f: Filters) {
  const includes = (value: string | null | undefined, search: string) =>
    normalize(value ?? "").includes(normalize(search.trim()));
  return vehicles
    .filter(
      (v) =>
        includes(
          [v.brand, v.model, v.version, v.city, v.source].join(" "),
          f.q,
        ) &&
        includes(v.brand, f.brand) &&
        includes(v.model, f.model) &&
        (!f.yearMin || v.modelYear >= Number(f.yearMin)) &&
        (!f.yearMax || v.modelYear <= Number(f.yearMax)) &&
        (!f.priceMin || v.priceCents >= Math.round(Number(f.priceMin) * 100)) &&
        (!f.priceMax || v.priceCents <= Math.round(Number(f.priceMax) * 100)) &&
        (!f.mileageMax || v.mileage <= Number(f.mileageMax)) &&
        (!f.state || v.state === f.state) &&
        includes(v.city, f.city) &&
        includes(v.source, f.source) &&
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
        default:
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      }
    });
}
