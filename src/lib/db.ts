import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function getDb() {
  // Placeholder permits a production build before the shared database is connected.
  // Real reads and writes are enabled only after DATABASE_URL is supplied.
  const url = process.env.DATABASE_URL || "postgres://neovia:local-only@127.0.0.1:5432/neovia";
  return drizzle(postgres(url, { prepare: false }), { schema });
}

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);
