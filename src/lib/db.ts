import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as PostgresClient } from "@/generated/prisma-postgres";
import { PrismaClient as SqliteClient } from "@/generated/prisma-sqlite";

const globalDb = globalThis as unknown as { prisma?: PostgresClient };
const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("DATABASE_URL não configurada para a conexão do banco.");
const sqlite = url.startsWith("file:");
const client = sqlite
  ? new SqliteClient({ adapter: new PrismaLibSQL({ url }) })
  : new PostgresClient({ adapter: new PrismaPg({ connectionString: url }) });
export const db =
  globalDb.prisma ??
  (client as unknown as PostgresClient);
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
