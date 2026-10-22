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
  "ListingPrice",
  "ProviderSpend",
  "SearchLock",
  "OlxLocation",
  "CatalogSearch",
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
    throw new Error(`Schema incompleto. Tabelas ausentes: ${missing.join(", ")}`);
  }
  console.log("Banco PostgreSQL acessível e schema do Radar pronto.");
} finally {
  await client.end();
}
