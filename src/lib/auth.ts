import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db";
import * as schema from "./schema";

const isDev = process.env.NODE_ENV === "development";
const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: schema,
    usePlural: true,
  }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET || "local-development-secret-replace-before-deployment",
  baseURL: baseUrl,
  basePath: "/api/auth",
  trustHost: true,
  trustedOrigins: isDev ? undefined : [
    new URL(baseUrl).origin,
  ],
});
