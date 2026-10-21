import { z } from "zod";
import { db } from "./db";
import { fuels, states, transmissions } from "./vehicle";

const textKeys = new Set(["q", "brand", "model", "version", "city", "source"]);
const numericKeys = new Set([
  "yearMin",
  "yearMax",
  "priceMin",
  "priceMax",
  "mileageMax",
  "manufactureYear",
  "days",
  "referenceDiscountMin",
]);
const booleanKeys = new Set(["favorite", "reduced", "exactMatch"]);
const values: Record<string, string[]> = {
  state: states,
  fuel: fuels,
  transmission: transmissions,
  sort: [
    "recent",
    "priceAsc",
    "priceDesc",
    "mileage",
    "year",
    "referenceDiscount",
    "reduction",
    "opportunity",
  ],
  classification: [
    "strong",
    "potential",
    "aligned",
    "above",
    "insufficient",
    "opportunities",
  ],
};

export const catalogSearchSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    query: z
      .string()
      .max(2048)
      .superRefine((query, ctx) => {
        if (
          query.startsWith("?") ||
          /[\r\n\u0000]/.test(query) ||
          /^(?:\/|[a-z][a-z\d+.-]*:)/i.test(query)
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              "Salve somente os parâmetros de filtro, sem URL ou caminho.",
          });
          return;
        }
        const params = new URLSearchParams(query);
        const seen = new Set<string>();
        for (const [key, value] of params) {
          if (seen.has(key)) {
            ctx.addIssue({
              code: "custom",
              message: `O filtro ${key} está repetido.`,
            });
            continue;
          }
          seen.add(key);
          if (textKeys.has(key)) {
            if (value.length > 200 || /[\u0000-\u001f]/.test(value))
              ctx.addIssue({
                code: "custom",
                message: `Texto inválido no filtro ${key}.`,
              });
          } else if (numericKeys.has(key)) {
            if (!value) continue;
            const number = Number(value);
            const isYear = ["yearMin", "yearMax", "manufactureYear"].includes(
              key,
            );
            const isInteger = isYear || ["mileageMax", "days"].includes(key);
            if (
              !/^\d+(?:\.\d{1,2})?$/.test(value) ||
              !Number.isFinite(number) ||
              number < 0 ||
              number > 20_000_000 ||
              (isInteger && !Number.isInteger(number)) ||
              (isYear &&
                (number < 1900 || number > new Date().getFullYear() + 2)) ||
              (key === "referenceDiscountMin" && number > 100) ||
              (key === "days" && (number < 1 || number > 36_500))
            ) {
              ctx.addIssue({
                code: "custom",
                message: `Valor inválido no filtro ${key}.`,
              });
            }
          } else if (booleanKeys.has(key)) {
            if (!["", "true", "false"].includes(value))
              ctx.addIssue({
                code: "custom",
                message: `Valor inválido no filtro ${key}.`,
              });
          } else if (Object.hasOwn(values, key)) {
            if (value && !values[key].includes(value))
              ctx.addIssue({
                code: "custom",
                message: `Opção inválida no filtro ${key}.`,
              });
          } else {
            ctx.addIssue({
              code: "custom",
              message: `Filtro desconhecido: ${key}.`,
            });
          }
        }
        for (const [min, max] of [
          ["yearMin", "yearMax"],
          ["priceMin", "priceMax"],
        ]) {
          if (
            params.get(min) &&
            params.get(max) &&
            Number(params.get(min)) > Number(params.get(max))
          ) {
            ctx.addIssue({
              code: "custom",
              message: "O mínimo não pode superar o máximo.",
            });
          }
        }
      })
      .transform((query) => {
        const params = new URLSearchParams(query);
        for (const [key, value] of [...params]) if (!value) params.delete(key);
        return params.toString();
      }),
  })
  .strict();

export class CatalogSearchError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const catalogSearchRepository = {
  list: () => db.catalogSearch.findMany({ orderBy: { createdAt: "desc" } }),
  create: async (input: unknown) => {
    const data = catalogSearchSchema.parse(input);
    return db.$transaction(async (tx) => {
      if ((await tx.catalogSearch.count()) >= 30)
        throw new CatalogSearchError(
          "Limite de 30 filtros salvos. Remova uma busca para salvar outra.",
          409,
        );
      return tx.catalogSearch.create({ data });
    });
  },
  remove: async (id: string) => {
    const result = await db.catalogSearch.deleteMany({ where: { id } });
    if (!result.count)
      throw new CatalogSearchError("Busca salva não encontrada.", 404);
    return { ok: true };
  },
};

// Bounded body for this small preferences endpoint; no provider requests or URLs are followed.
export async function catalogSearchBody(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new CatalogSearchError("Envie os filtros como JSON.", 415);
  const limit = 16_384;
  if (Number(request.headers.get("content-length")) > limit)
    throw new CatalogSearchError(
      "Os filtros excedem o tamanho permitido.",
      413,
    );
  if (!request.body) throw new SyntaxError("Missing JSON body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new CatalogSearchError(
          "Os filtros excedem o tamanho permitido.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}
