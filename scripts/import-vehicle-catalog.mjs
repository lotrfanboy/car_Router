import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const args = new Set(process.argv.slice(2));
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const packageDir = path.resolve(
  valueAfter("--package") ?? process.env.CATALOG_PACKAGE_DIR ?? "catalog-package",
);
const dryRun = args.has("--dry-run");
const activate = args.has("--activate");
const rollbackProbe = args.has("--rollback-probe");

const json = async (relative) =>
  JSON.parse(await readFile(path.join(packageDir, relative), "utf8"));
const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
const unique = (rows) => new Set(rows.map((row) => row.id)).size === rows.length;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function readPackage() {
  const catalogText = await readFile(
    path.join(packageDir, "canonico/catalog.json"),
    "utf8",
  );
  const [catalog, identityCrosswalk, observations, pendingReview, modelFile, versionFile] =
    await Promise.all([
      Promise.resolve(JSON.parse(catalogText)),
      json("canonico/identity-crosswalk.json"),
      json("catalogo/observations.json"),
      json("catalogo/pending-review.json"),
      json("portais-revisados/model-crosswalk.json"),
      json("portais-revisados/version-crosswalk-pending.json"),
    ]);
  const sha256 = digest(Buffer.from(catalogText));
  const revisionId = `radar-r2-${sha256.slice(0, 16)}`;
  const ids = {
    brands: new Set(catalog.brands.map((row) => row.id)),
    models: new Set(catalog.models.map((row) => row.id)),
    versions: new Set(catalog.versions.map((row) => row.id)),
    evidence: new Set(observations.map((row) => row.id)),
    sources: new Set(catalog.sources.map((row) => row.id)),
  };
  assert(
    catalog.status === "preparation_not_radar_import_schema",
    "Status canônico inesperado.",
  );
  assert(catalog.brands.length === 63, "A revisão deve conter 63 marcas.");
  assert(catalog.models.length === 1113, "A revisão deve conter 1.113 modelos.");
  assert(catalog.versions.length === 6112, "A revisão deve conter 6.112 versões.");
  assert(unique(catalog.brands) && unique(catalog.models) && unique(catalog.versions), "IDs canônicos duplicados.");
  assert(unique(observations), "IDs de evidência duplicados.");
  assert(catalog.models.every((row) => ids.brands.has(row.brandId)), "Modelo sem marca.");
  assert(catalog.versions.every((row) => ids.models.has(row.modelId)), "Versão sem modelo.");
  const allEvidence = catalog.brands
    .concat(catalog.models, catalog.versions)
    .flatMap((row) => row.evidenceIds);
  assert(allEvidence.every((id) => ids.evidence.has(id)), "Entidade com evidência inexistente.");
  assert(observations.every((row) => ids.sources.has(row.sourceId)), "Evidência com fonte inexistente.");
  const pendingIds = new Set(pendingReview.map((row) => row.id));
  assert([...pendingIds].every((id) => ids.evidence.has(id)), "Pendência sem observação.");
  const withoutVersion = catalog.models.filter((row) => !row.hasAcceptedVersions).length;
  assert(withoutVersion === 202, "A revisão deve preservar 202 modelos sem versão.");
  for (const [entityType, rows] of Object.entries(identityCrosswalk.maps)) {
    assert(
      Object.values(rows).every((id) => ids[entityType].has(id)),
      `Crosswalk de ${entityType} aponta para identidade inexistente.`,
    );
  }
  for (const row of modelFile.mappings) {
    const target = row.canonicalModelId ?? row.notCanonicalModelId;
    assert(target && ids.models.has(target), `Mapeamento ${row.id} sem modelo-alvo válido.`);
    assert(row.canonicalVersionId === null, `Mapeamento ${row.id} promove versão indevidamente.`);
  }
  for (const row of versionFile.mappings) {
    assert(row.canonicalVersionId === null, "Candidato de versão foi promovido indevidamente.");
    assert(ids.models.has(row.canonicalModelId), "Pendência aponta para modelo inexistente.");
    assert(
      row.candidateCanonicalVersionIds.every((id) => ids.versions.has(id)),
      "Pendência contém candidato de versão inexistente.",
    );
  }
  const sourceMappings = [
    ...modelFile.mappings.map((row) => ({
      revisionId,
      id: row.id,
      source: row.source,
      level: "model",
      status:
        row.status === "verified_model_mapping" ? "confirmed" : "divergent",
      sourceBrand: row.sourceBrand ?? null,
      sourceBrandId: row.sourceBrandId ?? null,
      sourceModelId: row.sourceModelId ?? null,
      sourceModelLabel: row.sourceModelLabel ?? null,
      sourceVersionId: null,
      sourceVersionLabel: null,
      canonicalBrandId: row.canonicalBrandId ?? null,
      canonicalModelId: row.canonicalModelId ?? null,
      canonicalVersionId: null,
      notCanonicalModelId: row.notCanonicalModelId ?? null,
      candidateVersionIds: "[]",
      scope: row.scope,
      rationale: row.rationale,
      evidence: JSON.stringify(row.evidence),
      reviewedAt: row.reviewedAt ?? null,
    })),
    ...versionFile.mappings.map((row, index) => ({
      revisionId,
      id: `version-pending-${index + 1}`,
      source: row.source,
      level: "version",
      status: "pending",
      sourceBrand: null,
      sourceBrandId: row.sourceIdentity.brandId ?? null,
      sourceModelId: row.sourceIdentity.modelId ?? null,
      sourceModelLabel: null,
      sourceVersionId: row.sourceIdentity.versionId ?? null,
      sourceVersionLabel: row.sourceVersionLabel,
      canonicalBrandId: null,
      canonicalModelId: row.canonicalModelId,
      canonicalVersionId: null,
      notCanonicalModelId: null,
      candidateVersionIds: JSON.stringify(row.candidateCanonicalVersionIds),
      scope: "version_under_confirmed_model",
      rationale: row.reason,
      evidence: JSON.stringify({ sourceObservationIds: row.sourceObservationIds }),
      reviewedAt: null,
    })),
  ];
  return {
    revisionId,
    sha256,
    catalog,
    observations,
    pendingIds,
    identityCrosswalk,
    sourceMappings,
    counts: {
      brands: catalog.brands.length,
      models: catalog.models.length,
      versions: catalog.versions.length,
      evidence: observations.length,
      withoutVersion,
      pendingEvidence: pendingIds.size,
      sourceMappings: sourceMappings.length,
    },
  };
}

const quoted = (name) => `"${name.replaceAll('"', '""')}"`;
async function insertRows(client, table, columns, rows, batchSize = 250) {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column] ?? null);
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await client.query(
      `insert into ${quoted(table)} (${columns.map(quoted).join(",")}) values ${tuples.join(",")}`,
      values,
    );
  }
}

async function databaseCounts(client, revisionId) {
  const tables = ["CatalogBrand", "CatalogModel", "CatalogVersion", "CatalogEvidence", "CatalogSourceMapping"];
  const result = {};
  for (const table of tables) {
    const row = await client.query(
      `select count(*)::int as count from ${quoted(table)} where "revisionId"=$1`,
      [revisionId],
    );
    result[table] = row.rows[0].count;
  }
  return result;
}

async function validateDatabase(client, data) {
  const counts = await databaseCounts(client, data.revisionId);
  assert(counts.CatalogBrand === data.counts.brands, "Contagem de marcas divergiu após carga.");
  assert(counts.CatalogModel === data.counts.models, "Contagem de modelos divergiu após carga.");
  assert(counts.CatalogVersion === data.counts.versions, "Contagem de versões divergiu após carga.");
  assert(counts.CatalogEvidence === data.counts.evidence, "Contagem de evidências divergiu após carga.");
  assert(counts.CatalogSourceMapping === data.counts.sourceMappings, "Contagem de correspondências divergiu após carga.");
  const integrity = await client.query(
    `select
       (select count(*)::int from "CatalogModel" m left join "CatalogBrand" b on b."revisionId"=m."revisionId" and b.id=m."brandId" where m."revisionId"=$1 and b.id is null) as orphan_models,
       (select count(*)::int from "CatalogVersion" v left join "CatalogModel" m on m."revisionId"=v."revisionId" and m.id=v."modelId" where v."revisionId"=$1 and m.id is null) as orphan_versions,
       (select count(*)::int from "CatalogModel" where "revisionId"=$1 and "hasAcceptedVersions"=false) as models_without_versions,
       (select count(*)::int from "CatalogSourceMapping" where "revisionId"=$1 and level='version' and "canonicalVersionId" is not null) as promoted_pending_versions`,
    [data.revisionId],
  );
  const row = integrity.rows[0];
  assert(row.orphan_models === 0 && row.orphan_versions === 0, "Carga criou vínculos órfãos.");
  assert(row.models_without_versions === 202, "Modelos sem versão foram perdidos.");
  assert(row.promoted_pending_versions === 0, "Versão pendente foi promovida.");
  return counts;
}

async function importPackage(client, data) {
  await client.query("begin");
  try {
    const state = await client.query(
      `select "activeRevisionId" from "CatalogState" where id='vehicle-catalog'`,
    );
    const activeRevisionId = state.rows[0]?.activeRevisionId ?? null;
    const existing = await client.query(
      `select id, status from "CatalogRevision" where id=$1`,
      [data.revisionId],
    );
    if (existing.rowCount) {
      if (activeRevisionId === data.revisionId) {
        const counts = await validateDatabase(client, data);
        await client.query("commit");
        return { action: "already-active", counts };
      }
      await client.query(`delete from "CatalogRevision" where id=$1`, [data.revisionId]);
    }
    await client.query(
      `insert into "CatalogRevision" (id,"schemaVersion","sourceSha256",status,"brandCount","modelCount","versionCount","evidenceCount","modelsWithoutVersion") values ($1,$2,$3,'loading',$4,$5,$6,$7,$8)`,
      [
        data.revisionId,
        String(data.catalog.schemaVersion),
        data.sha256,
        data.counts.brands,
        data.counts.models,
        data.counts.versions,
        data.counts.evidence,
        data.counts.withoutVersion,
      ],
    );
    await insertRows(
      client,
      "CatalogSource",
      ["revisionId", "id", "publisher", "url", "sha256", "publicationCycle", "cycleIsNotModelYear"],
      data.catalog.sources.map((row) => ({ revisionId: data.revisionId, ...row })),
    );
    await insertRows(
      client,
      "CatalogEvidence",
      ["revisionId", "id", "sourceId", "status", "payload"],
      data.observations.map((row) => ({
        revisionId: data.revisionId,
        id: row.id,
        sourceId: row.sourceId,
        status: data.pendingIds.has(row.id) ? "pending" : "accepted",
        payload: JSON.stringify(row),
      })),
      100,
    );
    await insertRows(
      client,
      "CatalogBrand",
      ["revisionId", "id", "name", "sourceIds", "sourceLabels", "identityDecisionIds"],
      data.catalog.brands.map((row) => ({
        revisionId: data.revisionId,
        id: row.id,
        name: row.name,
        sourceIds: JSON.stringify(row.sourceIds),
        sourceLabels: JSON.stringify(row.sourceLabels),
        identityDecisionIds: JSON.stringify(row.identityDecisionIds),
      })),
    );
    await insertRows(
      client,
      "CatalogModel",
      ["revisionId", "id", "brandId", "name", "sourceIds", "sourceLabels", "versionsPending", "hasAcceptedVersions"],
      data.catalog.models.map((row) => ({
        revisionId: data.revisionId,
        id: row.id,
        brandId: row.brandId,
        name: row.name,
        sourceIds: JSON.stringify(row.sourceIds),
        sourceLabels: JSON.stringify(row.sourceLabels),
        versionsPending: row.versionsPending,
        hasAcceptedVersions: row.hasAcceptedVersions,
      })),
    );
    await insertRows(
      client,
      "CatalogVersion",
      ["revisionId", "id", "modelId", "name", "engine", "transmission", "sourceIds", "sourceLabels"],
      data.catalog.versions.map((row) => ({
        revisionId: data.revisionId,
        id: row.id,
        modelId: row.modelId,
        name: row.name,
        engine: row.engine,
        transmission: row.transmission,
        sourceIds: JSON.stringify(row.sourceIds),
        sourceLabels: JSON.stringify(row.sourceLabels),
      })),
    );
    await insertRows(
      client,
      "CatalogBrandEvidence",
      ["revisionId", "brandId", "evidenceId"],
      data.catalog.brands.flatMap((row) =>
        row.evidenceIds.map((evidenceId) => ({ revisionId: data.revisionId, brandId: row.id, evidenceId })),
      ),
    );
    await insertRows(
      client,
      "CatalogModelEvidence",
      ["revisionId", "modelId", "evidenceId"],
      data.catalog.models.flatMap((row) =>
        row.evidenceIds.map((evidenceId) => ({ revisionId: data.revisionId, modelId: row.id, evidenceId })),
      ),
    );
    await insertRows(
      client,
      "CatalogVersionEvidence",
      ["revisionId", "versionId", "evidenceId"],
      data.catalog.versions.flatMap((row) =>
        row.evidenceIds.map((evidenceId) => ({ revisionId: data.revisionId, versionId: row.id, evidenceId })),
      ),
    );
    await insertRows(
      client,
      "CatalogIdentityCrosswalk",
      ["revisionId", "entityType", "previousIdentityId", "canonicalIdentityId"],
      Object.entries(data.identityCrosswalk.maps).flatMap(([entityType, mappings]) =>
        Object.entries(mappings).map(([previousIdentityId, canonicalIdentityId]) => ({
          revisionId: data.revisionId,
          entityType,
          previousIdentityId,
          canonicalIdentityId,
        })),
      ),
    );
    await insertRows(
      client,
      "CatalogSourceMapping",
      [
        "revisionId", "id", "source", "level", "status", "sourceBrand", "sourceBrandId",
        "sourceModelId", "sourceModelLabel", "sourceVersionId", "sourceVersionLabel",
        "canonicalBrandId", "canonicalModelId", "canonicalVersionId", "notCanonicalModelId",
        "candidateVersionIds", "scope", "rationale", "evidence", "reviewedAt",
      ],
      data.sourceMappings,
    );
    const counts = await validateDatabase(client, data);
    await client.query(
      `update "CatalogRevision" set status='valid', "validatedAt"=current_timestamp where id=$1`,
      [data.revisionId],
    );
    if (activate) {
      await client.query(
        `insert into "CatalogState" (id,"activeRevisionId","updatedAt") values ('vehicle-catalog',$1,current_timestamp)
         on conflict (id) do update set "activeRevisionId"=excluded."activeRevisionId", "updatedAt"=excluded."updatedAt"`,
        [data.revisionId],
      );
      await client.query(
        `update "CatalogRevision" set status='active', "activatedAt"=current_timestamp where id=$1`,
        [data.revisionId],
      );
    }
    await client.query("commit");
    return { action: activate ? "imported-and-activated" : "imported", counts };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function testRollback(client, data) {
  const id = `${data.revisionId}-rollback-probe`;
  await client.query(`delete from "CatalogRevision" where id=$1`, [id]);
  try {
    await client.query("begin");
    await client.query(
      `insert into "CatalogRevision" (id,"schemaVersion","sourceSha256",status,"brandCount","modelCount","versionCount","evidenceCount","modelsWithoutVersion") values ($1,'probe',$2,'loading',0,0,0,0,0)`,
      [id, digest(Buffer.from(id))],
    );
    throw new Error("Falha intencional de carga");
  } catch (error) {
    await client.query("rollback");
    if (error.message !== "Falha intencional de carga") throw error;
  }
  const result = await client.query(`select count(*)::int as count from "CatalogRevision" where id=$1`, [id]);
  assert(result.rows[0].count === 0, "Rollback deixou uma revisão parcial.");
  return { action: "rollback-preserved", revisionId: data.revisionId };
}

const data = await readPackage();
if (dryRun && !process.env.DATABASE_URL) {
  console.log(JSON.stringify({ action: "dry-run", revisionId: data.revisionId, sha256: data.sha256, counts: data.counts }, null, 2));
  process.exit(0);
}
assert(process.env.DATABASE_URL, "DATABASE_URL é obrigatória para acessar o banco.");
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  if (rollbackProbe) console.log(JSON.stringify(await testRollback(client, data), null, 2));
  else if (dryRun) {
    const state = await client.query(`select "activeRevisionId" from "CatalogState" where id='vehicle-catalog'`);
    console.log(JSON.stringify({ action: "dry-run", revisionId: data.revisionId, sha256: data.sha256, counts: data.counts, activeRevisionId: state.rows[0]?.activeRevisionId ?? null }, null, 2));
  } else console.log(JSON.stringify(await importPackage(client, data), null, 2));
} finally {
  await client.end();
}
