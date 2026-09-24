import { getDb } from "./db";
import { emailAccounts } from "./schema";
import { eq, and } from "drizzle-orm";
import { calendarPost, refreshCalendarAccessToken } from "./google-calendar";

export const BOOKING_WORKDAY_START_HOUR = 9;
export const BOOKING_WORKDAY_END_HOUR = 17;
export const BOOKING_SLOT_MINUTES = 30;
export const BOOKING_TIMEZONE = "Europe/Prague";

/** Najde jediný v appce připojený Google kalendář (single-tenant appka) a obnoví token, pokud je potřeba. */
export async function getBookingCalendarAccount() {
  const db = getDb();
  const [account] = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.provider, "google_calendar")))
    .limit(1);
  if (!account) return null;
  if (!account.accessToken || (account.expiresAt && account.expiresAt <= new Date())) {
    if (!account.refreshToken) return account;
    const refreshed = await refreshCalendarAccessToken(account.refreshToken);
    const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null;
    const [updated] = await db
      .update(emailAccounts)
      .set({ accessToken: refreshed.access_token, expiresAt, updatedAt: new Date() })
      .where(eq(emailAccounts.id, account.id))
      .returning();
    return updated;
  }
  return account;
}
