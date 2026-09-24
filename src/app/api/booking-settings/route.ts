import { auth } from "@/lib/auth";
import { DEFAULT_BOOKING_CONFIG } from "@/lib/booking";
import { getDb } from "@/lib/db";
import { bookingSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function actor() {
  return (await auth.api.getSession({ headers: await headers() }))?.user;
}

export async function GET() {
  const user = await actor();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  try {
    const [row] = await getDb()
      .select()
      .from(bookingSettings)
      .where(eq(bookingSettings.ownerId, user.id))
      .limit(1);

    if (!row) {
      return NextResponse.json({ ...DEFAULT_BOOKING_CONFIG, id: null });
    }
    return NextResponse.json({
      id: row.id,
      slotMinutes: row.slotMinutes,
      workdayStartHour: row.workdayStartHour,
      workdayEndHour: row.workdayEndHour,
      workdays: row.workdays,
      timezone: row.timezone,
      bufferMinutes: row.bufferMinutes,
    });
  } catch {
    return NextResponse.json({
      ...DEFAULT_BOOKING_CONFIG,
      id: null,
      migrationNeeded: true,
      error: "Tabulky bookingu ještě nejsou v databázi. Spusťte migraci 0016_booking_settings.sql.",
    });
  }
}

export async function PUT(request: Request) {
  const user = await actor();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const body = await request.json();
  const slotMinutes = Number(body.slotMinutes);
  const workdayStartHour = Number(body.workdayStartHour);
  const workdayEndHour = Number(body.workdayEndHour);
  const bufferMinutes = Number(body.bufferMinutes ?? 0);
  const workdays = Array.isArray(body.workdays)
    ? body.workdays.map((d: unknown) => Number(d)).filter((d: number) => d >= 0 && d <= 6)
    : DEFAULT_BOOKING_CONFIG.workdays;

  if (![15, 20, 30, 45, 60].includes(slotMinutes)) {
    return NextResponse.json({ error: "Délka schůzky musí být 15, 20, 30, 45 nebo 60 minut." }, { status: 400 });
  }
  if (
    Number.isNaN(workdayStartHour) ||
    Number.isNaN(workdayEndHour) ||
    workdayStartHour < 0 ||
    workdayEndHour > 24 ||
    workdayStartHour >= workdayEndHour
  ) {
    return NextResponse.json({ error: "Neplatná pracovní doba." }, { status: 400 });
  }
  if (!workdays.length) {
    return NextResponse.json({ error: "Vyberte alespoň jeden pracovní den." }, { status: 400 });
  }

  const values = {
    slotMinutes,
    workdayStartHour,
    workdayEndHour,
    workdays,
    timezone: typeof body.timezone === "string" && body.timezone ? body.timezone : "Europe/Prague",
    bufferMinutes: Math.max(0, Math.min(120, bufferMinutes || 0)),
    updatedAt: new Date(),
  };

  try {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(bookingSettings)
      .where(eq(bookingSettings.ownerId, user.id))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(bookingSettings)
        .set(values)
        .where(eq(bookingSettings.id, existing.id))
        .returning();
      return NextResponse.json(updated);
    }

    const [created] = await db
      .insert(bookingSettings)
      .values({ ownerId: user.id, ...values })
      .returning();
    return NextResponse.json(created);
  } catch {
    return NextResponse.json(
      {
        error:
          "Tabulky bookingu ještě nejsou v databázi. Spusťte migraci 0016_booking_settings.sql na produkční DB.",
      },
      { status: 503 },
    );
  }
}
