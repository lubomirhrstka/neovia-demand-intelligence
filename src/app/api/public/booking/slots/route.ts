import {
  BOOKING_SLOT_MINUTES,
  BOOKING_TIMEZONE,
  BOOKING_WORKDAY_END_HOUR,
  BOOKING_WORKDAY_START_HOUR,
  getBookingCalendarAccount,
} from "@/lib/booking";
import { calendarPost } from "@/lib/google-calendar";
import { NextResponse } from "next/server";

/** Převede "místní" datum+čas v dané časové zóně na UTC Date (funguje i přes DST). */
function zonedTimeToUtc(dateStr: string, hour: number, minute: number, timeZone: string) {
  const naive = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const tzString = naive.toLocaleString("en-US", { timeZone });
  const tzDate = new Date(tzString);
  const diff = naive.getTime() - tzDate.getTime();
  return new Date(naive.getTime() + diff);
}

export async function GET(request: Request) {
  const dateStr = new URL(request.url).searchParams.get("date");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "Zadejte datum ve formátu YYYY-MM-DD." }, { status: 400 });
  }
  const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return NextResponse.json({ slots: [] });

  const account = await getBookingCalendarAccount();
  if (!account?.accessToken) return NextResponse.json({ error: "Kalendář zatím není nastavený." }, { status: 503 });

  const dayStart = zonedTimeToUtc(dateStr, BOOKING_WORKDAY_START_HOUR, 0, BOOKING_TIMEZONE);
  const dayEnd = zonedTimeToUtc(dateStr, BOOKING_WORKDAY_END_HOUR, 0, BOOKING_TIMEZONE);

  try {
    const freebusy = await calendarPost<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(
      account.accessToken,
      "/freeBusy",
      { timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString(), items: [{ id: "primary" }] },
    );
    const busy = freebusy.calendars?.primary?.busy || [];
    const slots: string[] = [];
    const stepMs = BOOKING_SLOT_MINUTES * 60 * 1000;
    const now = Date.now();
    for (let start = dayStart.getTime(); start + stepMs <= dayEnd.getTime(); start += stepMs) {
      const end = start + stepMs;
      if (start < now) continue;
      const overlaps = busy.some((b) => start < new Date(b.end).getTime() && end > new Date(b.start).getTime());
      if (!overlaps) slots.push(new Date(start).toISOString());
    }
    return NextResponse.json({ slots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Termíny se nepodařilo načíst.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
