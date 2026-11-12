import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Offline review aid. Suggestions are never identity confirmations or DB writes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2];
const outputIndex = process.argv.indexOf("--output");
if (!input || input.startsWith("--"))
  throw Error(
    "Usage: node scripts/audit-listing-normalization.mjs saved-observations.json [--output report.json]",
  );
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const [snapshot, reviewed, envelope, sourceObservations, olxObservations] =
  await Promise.all([
    json(path.join(root, "src/data/search-catalog.json")),
    json(path.join(root, "src/data/commercial-models.json")),
    json(input),
    json(path.join(root, "src/data/source-model-observations.json")),
    json(path.join(root, "src/data/olx-model-observations.json")),
  ]);
const key = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1.")
    .replace(/[^a-z0-9.+]+/g, "");
const words = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const brandAliases = new Map(
  reviewed.brandAliases.flatMap((f) => f.members.map((m) => [key(m), f.name])),
);
const canonicalBrand = (name) => brandAliases.get(key(name)) ?? name;
const familyNames = new Map(
  reviewed.families.flatMap((f) =>
    f.members.map((m) => [`${key(f.brand)}:${key(m.label)}`, f.name]),
  ),
);
const makes = new Map();
for (const make of snapshot.brands) {
  const brand = canonicalBrand(make.name),
    models = makes.get(key(brand)) ?? new Map();
  for (const model of make.models) {
    const canonical =
      familyNames.get(`${key(brand)}:${key(model.name)}`) ?? model.name;
    const labels = models.get(canonical) ?? new Set();
    labels.add(model.name);
    labels.add(canonical);
    models.set(canonical, labels);
  }
  makes.set(key(brand), models);
}
const rows = Array.isArray(envelope)
  ? envelope
  : (envelope.listings ?? envelope.sources?.flatMap((s) => s.listings ?? []));
if (!Array.isArray(rows))
  throw Error("Expected sanitized listings array or sources[].listings");
const descriptions = new Map(),
  ids = new Map(),
  urls = new Map(),
  related = new Map();
for (const row of rows) {
  if (
    !["olx", "webmotors"].includes(row.source) ||
    typeof row.externalId !== "string"
  )
    throw Error("Invalid source identity in observations");
  const brand = row.original?.brand ?? row.brand,
    model = row.original?.model ?? row.sourceModel ?? row.model;
  const scoped = makes.get(key(canonicalBrand(brand)));
  const descriptionKey = JSON.stringify([
    row.source,
    brand,
    model,
    row.sourceIdentity,
  ]);
  let entry = descriptions.get(descriptionKey);
  if (!entry) {
    const candidates = [];
    for (const [name, labels] of scoped ?? [])
      for (const label of labels) {
        const pattern = new RegExp(
          "^" + [...key(label)].map(escape).join("[\\s_-]*") + "(?=$|[\\s_/-])",
          "i",
        );
        if (pattern.test(words(model).trim()))
          candidates.push({
            model: name,
            exact: key(label) === key(model),
            length: key(label).length,
          });
      }
    const longest = Math.max(0, ...candidates.map((c) => c.length));
    const selected = [
      ...new Set(
        candidates.filter((c) => c.length === longest).map((c) => c.model),
      ),
    ];
    const previousReviews = [
      ...sourceObservations.observations,
      ...olxObservations.observations,
    ].filter((observation) => {
      if (
        observation.source !== row.source ||
        key(observation.brand) !== key(brand) ||
        key(observation.model) !== key(model)
      )
        return false;
      if (
        observation.labelOnly &&
        Object.values(row.sourceIdentity ?? {}).some(Boolean)
      )
        return false;
      return ["brandId", "modelId"].every(
        (id) =>
          !observation.source_identity[id] ||
          observation.source_identity[id] === row.sourceIdentity?.[id],
      );
    });
    const reviewStatuses = [
      ...new Set(
        previousReviews.map(
          (observation) => observation.reviewStatus ?? "confirmed",
        ),
      ),
    ];
    const reviewedCrosswalkStatus =
      reviewStatuses.length === 1
        ? reviewStatuses[0]
        : reviewStatuses.length > 1
          ? "ambiguous"
          : "unreviewed";
    entry = {
      source: row.source,
      brand,
      model,
      brandInCatalog: !!scoped,
      modelCandidates: selected,
      literalModel: candidates.some((c) => c.exact),
      suggestionOnly: true,
      reviewedCrosswalkStatus,
      requiresReview: reviewedCrosswalkStatus !== "confirmed",
      hasSourceIds: Object.values(row.sourceIdentity ?? {}).some(Boolean),
      count: 0,
      examples: [],
    };
    descriptions.set(descriptionKey, entry);
  }
  entry.count++;
  if (entry.examples.length < 3)
    entry.examples.push({ externalId: row.externalId, url: row.url });
  const offer = {
    source: row.source,
    externalId: row.externalId,
    url: row.url,
    priceCents: row.priceCents,
    imageUrlSha256: row.imageUrl
      ? createHash("sha256").update(row.imageUrl).digest("hex")
      : null,
  };
  const append = (map, k) => map.set(k, [...(map.get(k) ?? []), offer]);
  append(ids, `${row.source}:${row.externalId}`);
  if (row.url) append(urls, `${row.source}:${row.url}`);
  if (
    entry.modelCandidates.length === 1 &&
    row.modelYear &&
    row.mileage > 0 &&
    row.city &&
    row.state
  )
    append(
      related,
      JSON.stringify([
        key(canonicalBrand(brand)),
        key(entry.modelCandidates[0]),
        row.modelYear,
        row.mileage,
        key(row.city),
        row.state,
      ]),
    );
}
const repeated = (map) =>
  [...map.values()].filter((values) => values.length > 1);
const report = {
  schemaVersion: 1,
  catalogRevision: snapshot.revision,
  offline: true,
  automaticChanges: false,
  counts: {
    observations: rows.length,
    sourceIdentities: ids.size,
    structuredDescriptions: descriptions.size,
    descriptionsWithConfirmedCrosswalk: [...descriptions.values()].filter(
      (d) => d.reviewedCrosswalkStatus === "confirmed",
    ).length,
    descriptionsWithPendingCrosswalk: [...descriptions.values()].filter(
      (d) => d.reviewedCrosswalkStatus === "pending",
    ).length,
    descriptionsWithoutReviewedCrosswalk: [...descriptions.values()].filter(
      (d) => d.reviewedCrosswalkStatus === "unreviewed",
    ).length,
    descriptionsMissingLiteralModel: [...descriptions.values()].filter(
      (d) => !d.literalModel,
    ).length,
  },
  descriptions: [...descriptions.values()],
  repeatedSourceIds: repeated(ids),
  repeatedSourceUrls: repeated(urls),
  possibleRelatedOffers: repeated(related).map((offers) => ({
    status: "unverified",
    sameVehicleConfirmed: false,
    priceDropConfirmed: false,
    reason:
      "Coincident brand/model suggestion, year, km and city/UF; source IDs remain independent",
    offers,
  })),
  limitations: [
    "Candidates come only from structured source attributes, never the listing title.",
    "A prefix suggestion is not an approved crosswalk; variants, source IDs and conflicts need review.",
    "Matching attributes, equal photos or prices do not prove vehicle identity. Price differences across listing IDs are not price history.",
    "No listings are hidden, merged, deleted or promoted to confirmed by this audit.",
  ],
};
const text = JSON.stringify(report, null, 2) + "\n";
if (outputIndex >= 0) {
  if (!process.argv[outputIndex + 1]) throw Error("Missing output path");
  await writeFile(process.argv[outputIndex + 1], text, { flag: "wx" });
  console.log(
    JSON.stringify({
      reportWritten: true,
      counts: report.counts,
      possibleRelatedGroups: report.possibleRelatedOffers.length,
    }),
  );
} else process.stdout.write(text);
