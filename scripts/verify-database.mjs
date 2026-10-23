import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL não configurada para verificar o banco.");
}

const requiredTables = [
  "Vehicle",
  "VehiclePrice",
  "SavedSearch",
  "SearchRun",
  "DiscoveredListing",
  "SearchCache",
  "Radar",
  "RadarRun",
  "RadarNotice",
  "RadarEmailDelivery",
  "RadarSourceState",
  "RadarObservation",
  "ListingPrice",
  "ProviderSpend",
  "ProviderOperation",
  "SearchLock",
  "OlxLocation",
  "CatalogSearch",
  "CatalogRevision",
  "CatalogState",
  "CatalogSource",
  "CatalogEvidence",
  "CatalogBrand",
  "CatalogModel",
  "CatalogVersion",
  "CatalogBrandEvidence",
  "CatalogModelEvidence",
  "CatalogVersionEvidence",
  "CatalogIdentityCrosswalk",
  "CatalogSourceMapping",
];

const client = new Client({ connectionString });

try {
  await client.connect();
  const result = await client.query(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])`,
    [requiredTables],
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(
      `Schema incompleto. Tabelas ausentes: ${missing.join(", ")}`,
    );
  }
  const radarColumns = await client.query(
    `select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name in ('Radar', 'RadarNotice')`,
  );
  const presentColumns = new Set(
    radarColumns.rows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const requiredRadarColumns = [
    "Radar.mode",
    "Radar.channel",
    "Radar.runsRemaining",
    "RadarNotice.kind",
    "RadarNotice.channel",
    "RadarNotice.matchStatus",
    "RadarNotice.payload",
    "RadarNotice.previousPriceCents",
    "RadarNotice.runId",
    "RadarNotice.emailEligible",
  ];
  const missingColumns = requiredRadarColumns.filter(
    (name) => !presentColumns.has(name),
  );
  if (missingColumns.length)
    throw new Error(
      `Schema de alertas incompleto. Colunas ausentes: ${missingColumns.join(", ")}`,
    );
  const catalog = await client.query(
    `select r.id, r.status, r."brandCount", r."modelCount", r."versionCount",
            (select count(*)::int from "CatalogBrand" b where b."revisionId"=r.id) as brands,
            (select count(*)::int from "CatalogModel" m where m."revisionId"=r.id) as models,
            (select count(*)::int from "CatalogVersion" v where v."revisionId"=r.id) as versions
       from "CatalogState" s
       join "CatalogRevision" r on r.id=s."activeRevisionId"
      where s.id='vehicle-catalog'`,
  );
  const active = catalog.rows[0];
  if (
    !active ||
    active.status !== "active" ||
    active.brands !== active.brandCount ||
    active.models !== active.modelCount ||
    active.versions !== active.versionCount
  )
    throw new Error("Nenhuma revisão íntegra do catálogo está ativa.");
  const emailMissing = [
    "RESEND_API_KEY",
    "RADAR_EMAIL_FROM",
    "RADAR_EMAIL_TO",
  ].filter((name) => !process.env[name]?.trim());
  console.log(
    `E-mail MVP: variáveis ausentes=${emailMissing.join(",") || "nenhuma"}; automático=${process.env.RADAR_EMAIL_ENABLED === "true"}. Remetente autorizado depende de validação no Resend.`,
  );
  console.log(
    `Banco e catálogo prontos: ${active.brands} marcas, ${active.models} modelos, ${active.versions} versões.`,
  );
} finally {
  await client.end();
}
