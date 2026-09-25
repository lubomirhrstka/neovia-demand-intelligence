import { getBookingConfig, getBookingCalendarAccount } from "@/lib/booking";
import { getDb } from "@/lib/db";
import { calendarPost } from "@/lib/google-calendar";
import { bookings } from "@/lib/schema";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { start, guestName, guestEmail, note } = body || {};
  if (!start || !guestName?.trim() || !guestEmail?.trim()) {
    return NextResponse.json({ error: "Doplňte jméno, e-mail a vyberte termín." }, { status: 400 });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(guestEmail.trim())) {
    return NextResponse.json({ error: "Zadejte platný e-mail." }, { status: 400 });
  }
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime()) || startDate.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "Vybraný termín už není platný, vyberte prosím jiný." }, { status: 400 });
  }

  const account = await getBookingCalendarAccount();
  if (!account?.accessToken || !account.ownerId) {
    return NextResponse.json({ error: "Kalendář zatím není nastavený." }, { status: 503 });
  }

  const config = await getBookingConfig(account.ownerId);
  const endDate = new Date(startDate.getTime() + config.slotMinutes * 60 * 1000);

  try {
    const payload = {
      summary: `Hovor: ${guestName.trim()} × NEOVIA`,
      description: [
        config.confirmationMessage?.trim() || "Rezervace přes veřejný booking odkaz NEOVIA Demand Intelligence.",
        `Host: ${guestName.trim()} (${guestEmail.trim()})`,
        `Délka: ${config.slotMinutes} min`,
        note?.trim() ? `Poznámka: ${note.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
      attendees: [{ email: guestEmail.trim(), displayName: guestName.trim() }],
    };
    const event = await calendarPost<{ id: string; htmlLink?: string }>(
      account.accessToken,
      "/calendars/primary/events?sendUpdates=all",
      payload,
    );
    await getDb().insert(bookings).values({
      ownerId: account.ownerId,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim(),
      note: note?.trim() || null,
      startsAt: startDate,
      endsAt: endDate,
      externalEventId: event.id,
    });
    return NextResponse.json({ ok: true, htmlLink: event.htmlLink, slotMinutes: config.slotMinutes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rezervaci se nepodařilo vytvořit.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
