import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function getDb() {
  const url = process.env.DATABASE_URL || "postgres://neovia:local-only@127.0.0.1:5432/neovia";
  return drizzle(postgres(url, { prepare: false }), { schema });
}

// Singleton instance pro API routes
export const db = getDb();
export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);
