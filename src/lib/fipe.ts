import { z } from "zod";
import { parseMoneyInput } from "./manual-form-values";
export type FipeQuery = {
  type: string;
  brand?: string;
  model?: string;
  year?: string;
};
export function fipePath(q: FipeQuery): string | null {
  if (q.type === "brands") return "marcas/v1/carros";
  if (!/^\d{1,6}$/.test(q.brand ?? "")) return null;
  if (q.type === "models") return `veiculos/v1/carros/${q.brand}`;
  if (!/^\d{1,8}$/.test(q.model ?? "")) return null;
  if (q.type === "years") return `anos/v1/carros/${q.brand}/${q.model}`;
  if (q.type === "detail" && /^\d{4,5}-[1-9]$/.test(q.year ?? ""))
    return `detalhes/v1/carros/${q.brand}/${q.model}/${q.year}`;
  return null;
}
export function fipeOptions(input: unknown, years = false) {
  const data = z
    .array(
      z.object({
        valor: z.union([z.string(), z.number()]),
        nome: z.string().max(240).optional(),
        modelo: z.string().max(240).optional(),
      }),
    )
    .max(20000)
    .parse(input);
  return data
    .map((row) => ({
      code: String(row.valor),
      name: row.nome ?? row.modelo ?? "",
    }))
    .filter(
      (row) =>
        row.name && (years ? /^\d{4,5}-[1-9]$/ : /^\d{1,8}$/).test(row.code),
    );
}
export function fipeReference(input: unknown) {
  const row = z
    .object({
      valor: z.string().max(80),
      marca: z.string().min(1).max(100),
      modelo: z.string().min(1).max(240),
      anoModelo: z.coerce.number().int().min(1900).max(32000),
      combustivel: z.string().min(1).max(80),
      codigoFipe: z.string().regex(/^\d{6}-\d$/),
      mesReferencia: z.string().min(1).max(100),
      dataConsulta: z.string().max(200).optional().nullable(),
    })
    .parse(input);
  const priceCents = parseMoneyInput(row.valor);
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0)
    throw Error("Valor FIPE inválido");
  return {
    priceCents,
    brand: row.marca,
    model: row.modelo,
    modelYear: row.anoModelo,
    fuel: row.combustivel,
    code: row.codigoFipe,
    referenceMonth: row.mesReferencia,
    providerDate: row.dataConsulta ?? null,
  };
}
export type FipeReference = ReturnType<typeof fipeReference>;
