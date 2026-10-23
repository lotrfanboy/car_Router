import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Offline only: consumes the public response of an already authorized catalog
// operation. This script never requests credentials or calls the provider.
const input = process.argv[2];
if (!input)
  throw new Error(
    "Usage: node scripts/import-search-catalog.mjs operation.json [output-directory]",
  );
const output = resolve(process.argv[3] ?? "src/data");
const envelope = JSON.parse(await readFile(input, "utf8"));
const operation = envelope.operation ?? envelope;
if (operation.status !== "succeeded" || operation.error)
  throw new Error("Catalog operation did not succeed.");
const body = operation.response;
if (typeof body !== "string")
  throw new Error("Missing original catalog response.");
const hash = createHash("sha256").update(body).digest("hex");
const summary =
  typeof operation.summary === "string"
    ? JSON.parse(operation.summary)
    : operation.summary;
if (summary?.sha256 !== hash || summary?.bytes !== Buffer.byteLength(body))
  throw new Error("Catalog response hash/size mismatch.");
const response = JSON.parse(body);
if (
  !response.ok ||
  response.meta?.stop_reason !== "complete" ||
  response.meta.api !== "webmotors" ||
  response.meta.endpoint !== "makes_models" ||
  response.data?.vehicle_type !== "car" ||
  !Array.isArray(response.data?.makes)
)
  throw new Error("Incomplete or unexpected catalog response.");
const { makes, make_count: makeCount, model_count: modelCount } = response.data;
if (makes.length !== makeCount || makes.length !== response.meta.record_count)
  throw new Error("Brand count mismatch.");
const retrievedAt = response.meta.fetched_at;
if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt)))
  throw new Error("Missing catalog retrieval timestamp.");
const key = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.+]+/g, "");
const seenBrands = new Set();
const normalizedCollisions = [];
let leaves = 0;
const brands = makes.map((entry) => {
  if (
    typeof entry.make !== "string" ||
    !entry.make.trim() ||
    !Array.isArray(entry.models) ||
    entry.models.length !== entry.model_count
  )
    throw new Error("Invalid brand or model count.");
  const brandKey = key(entry.make);
  if (seenBrands.has(brandKey))
    throw new Error(`Duplicate native brand: ${entry.make}`);
  seenBrands.add(brandKey);
  const seenModels = new Set();
  const normalizedModels = new Map();
  const models = entry.models.map((name) => {
    if (typeof name !== "string" || !name.trim())
      throw new Error("Invalid model label.");
    const modelKey = name
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (seenModels.has(modelKey))
      throw new Error(`Duplicate native model: ${entry.make} ${name}`);
    seenModels.add(modelKey);
    const labels = normalizedModels.get(key(name)) ?? [];
    labels.push(name);
    normalizedModels.set(key(name), labels);
    leaves += 1;
    return { name };
  });
  for (const labels of normalizedModels.values())
    if (labels.length > 1)
      normalizedCollisions.push({ brand: entry.make, labels });
  return { source: "webmotors", name: entry.make, models };
});
if (leaves !== modelCount) throw new Error("Total model count mismatch.");
const date = retrievedAt.slice(0, 10).replaceAll("-", "");
const evidenceId = `reef-makes-models-${date}-${hash.slice(0, 16)}`;
const snapshot = {
  revision: evidenceId,
  retrievedAt,
  evidence: [
    {
      id: evidenceId,
      url: "https://api.reefapi.com/webmotors/v1/makes_models",
      retrievedAt,
      sha256: hash,
      kind: "catalog",
    },
  ],
  brands,
};
await mkdir(resolve(output, "evidence"), { recursive: true });
// Preserve the public response byte-for-byte: this file's SHA-256 is the evidence hash.
await writeFile(
  resolve(output, "evidence", `reef-makes-models-${date}.json`),
  body,
);
await writeFile(
  resolve(output, "search-catalog.json"),
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      revision: snapshot.revision,
      retrievedAt,
      brands: makes.length,
      models: leaves,
      sha256: hash,
      bytes: Buffer.byteLength(body),
      sourceIdsReturned: false,
      normalizedCollisions,
      stopReason: response.meta.stop_reason,
      upstreamRequests: response.meta.upstream_requests,
      chargedCredits: response.meta.charged_credits,
    },
    null,
    2,
  ),
);
