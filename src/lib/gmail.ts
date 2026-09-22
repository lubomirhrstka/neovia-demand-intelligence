import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { emailAccounts } from "./schema";

const tokenUrl = "https://oauth2.googleapis.com/token";
const gmailBase = "https://gmail.googleapis.com/gmail/v1/users/me";

export const gmailScopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function gmailConfig() {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri =
    process.env.GOOGLE_GMAIL_REDIRECT_URI ||
    `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/email/gmail/callback`;
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
}

export async function exchangeCodeForTokens(code: string) {
  const config = gmailConfig();
  if (!config.configured) throw new Error("Google OAuth údaje nejsou nastavené.");
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Gmail OAuth token se nepodařilo získat.");
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const config = gmailConfig();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Gmail token se nepodařilo obnovit.");
  return data as { access_token: string; expires_in?: number; scope?: string; token_type?: string };
}

export async function gmailFetch<T>(accessToken: string, path: string) {
  const response = await fetch(`${gmailBase}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail API volání selhalo.");
  return data as T;
}

export async function gmailPost<T>(accessToken: string, path: string, body: unknown) {
  const response = await fetch(`${gmailBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail API volání selhalo.");
  return data as T;
}

export async function getFreshGmailAccount(ownerId: string) {
  const db = getDb();
  const [account] = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.ownerId, ownerId), eq(emailAccounts.provider, "gmail")))
    .limit(1);
  if (!account) return null;
  if (!account.accessToken || (account.expiresAt && account.expiresAt <= new Date())) {
    if (!account.refreshToken) return account;
    const refreshed = await refreshAccessToken(account.refreshToken);
    const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null;
    const [updated] = await db
      .update(emailAccounts)
      .set({
        accessToken: refreshed.access_token,
        tokenType: refreshed.token_type || account.tokenType,
        scope: refreshed.scope || account.scope,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(emailAccounts.id, account.id))
      .returning();
    return updated;
  }
  return account;
}
