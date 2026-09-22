import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { emailAccounts } from "./schema";

const tokenUrl = "https://oauth2.googleapis.com/token";
const calendarBase = "https://www.googleapis.com/calendar/v3";

export const googleCalendarScopes = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function googleCalendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/calendar/google/callback`;
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
}

export async function exchangeCalendarCodeForTokens(code: string) {
  const config = googleCalendarConfig();
  if (!config.configured) throw new Error("Google Calendar OAuth údaje nejsou nastavené.");
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Google Calendar token se nepodařilo získat.");
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
}

export async function refreshCalendarAccessToken(refreshToken: string) {
  const config = googleCalendarConfig();
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
  if (!response.ok) throw new Error(data.error_description || data.error || "Google Calendar token se nepodařilo obnovit.");
  return data as { access_token: string; expires_in?: number; scope?: string; token_type?: string };
}

export async function calendarFetch<T>(accessToken: string, path: string) {
  const response = await fetch(`${calendarBase}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Google Calendar API volání selhalo.");
  return data as T;
}

export async function calendarPost<T>(accessToken: string, path: string, body: unknown) {
  const response = await fetch(`${calendarBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Google Calendar API volání selhalo.");
  return data as T;
}

export async function calendarPatch<T>(accessToken: string, path: string, body: unknown) {
  const response = await fetch(`${calendarBase}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Google Calendar API volání selhalo.");
  return data as T;
}

export async function calendarDelete(accessToken: string, path: string) {
  const response = await fetch(`${calendarBase}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 204 || response.status === 404 || response.status === 410) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Událost se v Google kalendáři nepodařilo smazat.");
}

export async function googleProfile(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Google profil se nepodařilo načíst.");
  return data as { email?: string; name?: string };
}

export async function getFreshCalendarAccount(ownerId: string) {
  const db = getDb();
  const [account] = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.ownerId, ownerId), eq(emailAccounts.provider, "google_calendar")))
    .limit(1);
  if (!account) return null;
  if (!account.accessToken || (account.expiresAt && account.expiresAt <= new Date())) {
    if (!account.refreshToken) return account;
    const refreshed = await refreshCalendarAccessToken(account.refreshToken);
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
