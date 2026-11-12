import { expect, it, vi } from "vitest";
import {
  fipeSnapshotSchema,
  localFipeSelection,
  readLocalFipe,
} from "../src/lib/fipe-local";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const record = {
  brandKey: "bmw",
  modelKey: "009038-7",
  yearKey: "1991-1",
  brand: "BMW",
  model: "320i",
  modelYear: 1991,
  fuel: "Gasolina",
  code: "009038-7",
  priceCents: 1120000,
};
const input = {
  schemaVersion: 1,
  competence: "2026-11",
  referenceMonth: "novembro de 2026",
  source: "Fixture sintética de teste",
  sourceUrl: "https://example.test/fipe",
  rightsNote: "Dados fictícios para teste, não publicar como tabela oficial.",
  records: [record],
};
it("selects exact locally imported versions without price proximity matching", () => {
  const data = fipeSnapshotSchema.parse({
    ...input,
    importedAt: "2026-11-04T12:00:00.000Z",
  });
  expect(localFipeSelection(data, { type: "models", brand: "bmw" })).toEqual({
    options: [{ code: "009038-7", name: "320i" }],
  });
  expect(
    localFipeSelection(data, {
      type: "detail",
      brand: "bmw",
      model: "009038-7",
      year: "1991-1",
    }),
  ).toMatchObject({
    reference: { priceCents: 1120000, referenceMonth: "novembro de 2026" },
  });
  expect(
    localFipeSelection(data, {
      type: "detail",
      brand: "bmw",
      model: "unknown",
      year: "1991-1",
    }),
  ).toBeNull();
  expect(() =>
    fipeSnapshotSchema.parse({ ...data, records: [record, record] }),
  ).toThrow();
});
it("imports offline idempotently, preserves revisions and never overwrites prior monthly prices", async () => {
  const directory = mkdtempSync(
      path.join(process.env.RADAR_TEST_ROOT!, "fipe-local-"),
    ),
    file = path.join(directory, "input.json"),
    script = path.resolve("scripts/import-fipe-reference.mjs");
  const run = () =>
    execFileSync(process.execPath, [script, "--file", file], {
      cwd: directory,
      env: {
        ...process.env,
        DATABASE_URL:
          "file:" + path.join(directory, "isolated.db").replaceAll("\\", "/"),
      },
      encoding: "utf8",
    });
  writeFileSync(file, JSON.stringify(input));
  run();
  const stored = path.join(directory, "validation-private/fipe-reference"),
    first = readdirSync(stored)[0],
    bytes = readFileSync(path.join(stored, first));
  run();
  expect(readdirSync(stored)).toHaveLength(1);
  writeFileSync(
    file,
    JSON.stringify({ ...input, records: [{ ...record, priceCents: 1130000 }] }),
  );
  run();
  expect(readdirSync(stored)).toHaveLength(2);
  expect(readFileSync(path.join(stored, first))).toEqual(bytes);
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(directory);
  try {
    const current = await readLocalFipe(new Date("2026-11-30T23:59:59Z"));
    expect(current?.stale).toBe(false);
    const later = await readLocalFipe(new Date("2026-12-01T00:00:00Z"));
    expect(later?.stale).toBe(true);
    expect(later?.data.competence).toBe("2026-11");
    expect(await readLocalFipe(new Date("2026-10-31T23:59:59Z"))).toBeNull();
  } finally {
    cwd.mockRestore();
  }
});
it("does not access a remote service when no local monthly snapshot exists", async () => {
  expect(await readLocalFipe()).toBeNull();
});
