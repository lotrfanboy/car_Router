import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const schema = process.env.PRISMA_SCHEMA || "prisma/schema.prisma";
const sqlite = schema.includes("/sqlite/");
const url = process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://prisma:placeholder@localhost:5432/postgres";

export default sqlite
  ? defineConfig({
      schema,
      experimental: { adapter: true },
      engine: "js",
      adapter: async () =>
        new PrismaLibSQL({
          url: process.env.DATABASE_URL || "file:./prisma/sqlite/radar.db",
        }),
    })
  : defineConfig({
      schema,
      engine: "classic",
      datasource: { url },
    });
