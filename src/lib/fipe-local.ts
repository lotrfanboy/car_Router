import { z } from "zod";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const fipeLocalRecord = z.object({
  brandKey: key,
  modelKey: key,
  yearKey: z.string().regex(/^\d{4,5}-[1-9]$/),
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(240),
  modelYear: z.number().int().min(1900).max(32000),
  fuel: z.string().min(1).max(80),
  code: z.string().regex(/^\d{6}-\d$/),
  priceCents: z.number().int().positive().max(2000000000),
});
export const fipeSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    competence: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/),
    referenceMonth: z.string().min(1).max(100),
    source: z.string().min(1).max(200),
    sourceUrl: z.url().max(1000),
    rightsNote: z.string().min(1).max(2000),
    importedAt: z.iso.datetime(),
    records: z.array(fipeLocalRecord).min(1).max(2000000),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const row of data.records) {
      const k = `${row.brandKey}/${row.modelKey}/${row.yearKey}`;
      if (seen.has(k) || Number(row.yearKey.split("-")[0]) !== row.modelYear)
        ctx.addIssue({
          code: "custom",
          message: "Identidade repetida ou ano inconsistente na base FIPE.",
        });
      seen.add(k);
    }
  });
export type FipeSnapshot = z.infer<typeof fipeSnapshotSchema>;
let cached: { file: string; mtime: number; data: FipeSnapshot } | null = null;
/** Reads only an explicitly imported local monthly snapshot. Never fetches a provider. */
export async function readLocalFipe(now = new Date()) {
  const directory = path.join(
    process.cwd(),
    "validation-private",
    "fipe-reference",
  );
  const month = now.toISOString().slice(0, 7);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return null;
  }
  const candidates = await Promise.all(
    names
      .filter(
        (n) =>
          /^20\d{2}-(?:0[1-9]|1[0-2])-[a-f0-9]{12}\.json$/.test(n) &&
          n.slice(0, 7) <= month,
      )
      .map(async (n) => ({
        name: n,
        file: path.join(directory, n),
        info: await stat(path.join(directory, n)),
      })),
  );
  candidates.sort(
    (a, b) =>
      b.name.slice(0, 7).localeCompare(a.name.slice(0, 7)) ||
      b.info.mtimeMs - a.info.mtimeMs,
  );
  if (!candidates.length) return null;
  const latest = candidates[0];
  if (latest.info.size > 128 * 1024 * 1024)
    throw Error("Base FIPE excede o limite de leitura");
  if (cached?.file === latest.file && cached.mtime === latest.info.mtimeMs)
    return { data: cached.data, stale: cached.data.competence !== month };
  const data = fipeSnapshotSchema.parse(
    JSON.parse(await readFile(latest.file, "utf8")),
  );
  if (data.competence !== latest.name.slice(0, 7))
    throw Error("Competência FIPE inconsistente");
  cached = { file: latest.file, mtime: latest.info.mtimeMs, data };
  return { data, stale: data.competence !== month };
}
export function localFipeSelection(
  data: FipeSnapshot,
  q: { type: string; brand?: string; model?: string; year?: string },
) {
  const rows = data.records.filter(
    (r) =>
      (!q.brand || r.brandKey === q.brand) &&
      (!q.model || r.modelKey === q.model),
  );
  if (q.type === "detail") {
    if (!q.brand || !q.model || !q.year) return null;
    const row = rows.find((r) => r.yearKey === q.year);
    return row
      ? {
          reference: {
            priceCents: row.priceCents,
            brand: row.brand,
            model: row.model,
            modelYear: row.modelYear,
            fuel: row.fuel,
            code: row.code,
            referenceMonth: data.referenceMonth,
            providerDate: null,
          },
        }
      : null;
  }
  let options: { code: string; name: string }[];
  if (q.type === "brands")
    options = data.records.map((r) => ({ code: r.brandKey, name: r.brand }));
  else if (q.type === "models" && q.brand)
    options = rows.map((r) => ({ code: r.modelKey, name: r.model }));
  else if (q.type === "years" && q.brand && q.model)
    options = rows.map((r) => ({
      code: r.yearKey,
      name: `${r.modelYear === 32000 ? "Zero km" : r.modelYear} · ${r.fuel}`,
    }));
  else return null;
  return {
    options: [...new Map(options.map((o) => [o.code, o])).values()].sort(
      (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    ),
  };
}
