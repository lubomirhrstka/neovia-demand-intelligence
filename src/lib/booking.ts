import { getDb } from "./db";
import { bookingBlocks, bookingSettings, emailAccounts } from "./schema";
import { and, eq, sql } from "drizzle-orm";
import { refreshCalendarAccessToken } from "./google-calendar";

export const BOOKING_TIMEZONE = "Europe/Prague";

export type BookingConfig = {
  slotMinutes: number;
  workdayStartHour: number;
  workdayEndHour: number;
  workdays: number[];
  timezone: string;
  bufferMinutes: number;
};

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  slotMinutes: 30,
  workdayStartHour: 9,
  workdayEndHour: 17,
  workdays: [1, 2, 3, 4, 5],
  timezone: BOOKING_TIMEZONE,
  bufferMinutes: 0,
};

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

export async function getBookingConfig(ownerId?: string | null): Promise<BookingConfig> {
  if (!ownerId) return { ...DEFAULT_BOOKING_CONFIG };
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(bookingSettings)
      .where(eq(bookingSettings.ownerId, ownerId))
      .limit(1);
    if (!row) return { ...DEFAULT_BOOKING_CONFIG };
    const workdays = Array.isArray(row.workdays)
      ? row.workdays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
      : DEFAULT_BOOKING_CONFIG.workdays;
    return {
      slotMinutes: [15, 20, 30, 45, 60].includes(row.slotMinutes) ? row.slotMinutes : 30,
      workdayStartHour: Math.min(23, Math.max(0, row.workdayStartHour ?? 9)),
      workdayEndHour: Math.min(24, Math.max(1, row.workdayEndHour ?? 17)),
      workdays: workdays.length ? workdays : DEFAULT_BOOKING_CONFIG.workdays,
      timezone: row.timezone || BOOKING_TIMEZONE,
      bufferMinutes: Math.max(0, Math.min(120, row.bufferMinutes ?? 0)),
    };
  } catch {
    // Tables may not exist yet before migration — fall back to defaults
    return { ...DEFAULT_BOOKING_CONFIG };
  }
}

/** Bloky (dovolená apod.), které překrývají daný den. */
export async function getBookingBlocksForDay(ownerId: string, dayStart: Date, dayEnd: Date) {
  try {
    const db = getDb();
    return await db
      .select()
      .from(bookingBlocks)
      .where(
        and(
          eq(bookingBlocks.ownerId, ownerId),
          sql`${bookingBlocks.startsAt} < ${dayEnd} AND ${bookingBlocks.endsAt} > ${dayStart}`,
        ),
      );
  } catch {
    return [];
  }
}

/** Převede "místní" datum+čas v dané časové zóně na UTC Date (funguje i přes DST). */
export function zonedTimeToUtc(dateStr: string, hour: number, minute: number, timeZone: string) {
  const naive = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const tzString = naive.toLocaleString("en-US", { timeZone });
  const tzDate = new Date(tzString);
  const diff = naive.getTime() - tzDate.getTime();
  return new Date(naive.getTime() + diff);
}
