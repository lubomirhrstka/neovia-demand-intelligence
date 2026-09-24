import {
  getBookingBlocksForDay,
  getBookingCalendarAccount,
  getBookingConfig,
  zonedTimeToUtc,
} from "@/lib/booking";
import { calendarPost } from "@/lib/google-calendar";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const dateStr = new URL(request.url).searchParams.get("date");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "Zadejte datum ve formátu YYYY-MM-DD." }, { status: 400 });
  }

  const account = await getBookingCalendarAccount();
  if (!account?.accessToken) {
    return NextResponse.json({ error: "Kalendář zatím není nastavený." }, { status: 503 });
  }

  const config = await getBookingConfig(account.ownerId);
  const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  if (!config.workdays.includes(weekday)) {
    return NextResponse.json({ slots: [], config: { slotMinutes: config.slotMinutes } });
  }

  const dayStart = zonedTimeToUtc(dateStr, config.workdayStartHour, 0, config.timezone);
  const dayEnd = zonedTimeToUtc(dateStr, config.workdayEndHour, 0, config.timezone);

  try {
    const freebusy = await calendarPost<{
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    }>(account.accessToken, "/freeBusy", {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: "primary" }],
    });
    const busy = freebusy.calendars?.primary?.busy || [];
    const blocks =
      account.ownerId ? await getBookingBlocksForDay(account.ownerId, dayStart, dayEnd) : [];

    const slots: string[] = [];
    const stepMs = config.slotMinutes * 60 * 1000;
    const bufferMs = config.bufferMinutes * 60 * 1000;
    const now = Date.now();

    for (let start = dayStart.getTime(); start + stepMs <= dayEnd.getTime(); start += stepMs) {
      const end = start + stepMs;
      if (start < now) continue;
      const overlapsBusy = busy.some(
        (b) => start < new Date(b.end).getTime() + bufferMs && end + bufferMs > new Date(b.start).getTime(),
      );
      if (overlapsBusy) continue;
      const overlapsBlock = blocks.some(
        (b) => start < b.endsAt.getTime() && end > b.startsAt.getTime(),
      );
      if (overlapsBlock) continue;
      slots.push(new Date(start).toISOString());
    }
    return NextResponse.json({ slots, config: { slotMinutes: config.slotMinutes } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Termíny se nepodařilo načíst.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
