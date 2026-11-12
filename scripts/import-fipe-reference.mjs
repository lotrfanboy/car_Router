// Explicit offline import of an authorized monthly snapshot. No network or database writes.
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
if (!process.env.DATABASE_URL?.startsWith("file:"))
  throw Error("Importação disponível apenas no ambiente SQLite local.");
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--file")
  throw Error(
    "Uso: node scripts/import-fipe-reference.mjs --file arquivo-autorizado.json",
  );
const input = path.resolve(args[1]);
if ((await stat(input)).size > 128 * 1024 * 1024)
  throw Error("Arquivo excede 128 MB");
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const row = z.object({
  brandKey: id,
  modelKey: id,
  yearKey: z.string().regex(/^\d{4,5}-[1-9]$/),
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(240),
  modelYear: z.number().int().min(1900).max(32000),
  fuel: z.string().min(1).max(80),
  code: z.string().regex(/^\d{6}-\d$/),
  priceCents: z.number().int().positive().max(2000000000),
});
const schema = z.object({
  schemaVersion: z.literal(1),
  competence: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/),
  referenceMonth: z.string().min(1).max(100),
  source: z.string().min(1).max(200),
  sourceUrl: z.url().max(1000),
  rightsNote: z.string().min(1).max(2000),
  records: z.array(row).min(1).max(2000000),
});
const data = schema.parse(
  JSON.parse((await readFile(input, "utf8")).replace(/^\uFEFF/, "")),
);
if (data.competence > new Date().toISOString().slice(0, 7))
  throw Error(
    "Competência futura não pode ser publicada como referência atual.",
  );
const keys = new Set();
for (const r of data.records) {
  const k = `${r.brandKey}/${r.modelKey}/${r.yearKey}`;
  if (keys.has(k) || Number(r.yearKey.split("-")[0]) !== r.modelYear)
    throw Error("Chave repetida ou ano inconsistente");
  keys.add(k);
}
const hash = createHash("sha256")
  .update(JSON.stringify(data))
  .digest("hex")
  .slice(0, 12);
const directory = path.join(
  process.cwd(),
  "validation-private",
  "fipe-reference",
);
await mkdir(directory, { recursive: true });
const output = path.join(directory, `${data.competence}-${hash}.json`);
try {
  await writeFile(
    output,
    JSON.stringify({ ...data, importedAt: new Date().toISOString() }),
    { encoding: "utf8", flag: "wx" },
  );
  console.log(
    `Base local importada: ${data.competence}; ${data.records.length} referências. Históricos preservados.`,
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(
    "Esta mesma base já foi importada; nenhum arquivo foi sobrescrito.",
  );
}
