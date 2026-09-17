import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db";
import * as schema from "./schema";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user: schema.users, session: schema.sessions, account: schema.accounts, verification: schema.verifications },
  }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET || "local-development-secret-replace-before-deployment",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
});
