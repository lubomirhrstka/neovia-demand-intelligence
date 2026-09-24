import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_PRISMA_URL ||
    "postgres://neovia:local-only@127.0.0.1:5432/neovia"
  );
}

export function getDb() {
  const url = resolveDatabaseUrl();
  return drizzle(postgres(url, { prepare: false }), { schema });
}

// Singleton instance pro API routes
export const db = getDb();
export const isDatabaseConfigured = Boolean(
  process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_PRISMA_URL,
);
