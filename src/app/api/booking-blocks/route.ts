import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureBookingTables } from "@/lib/ensure-booking-tables";
import { bookingBlocks } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function actor() {
  return (await auth.api.getSession({ headers: await headers() }))?.user;
}

export async function GET() {
  const user = await actor();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  try {
    await ensureBookingTables();
    const rows = await getDb()
      .select()
      .from(bookingBlocks)
      .where(eq(bookingBlocks.ownerId, user.id))
      .orderBy(desc(bookingBlocks.startsAt));
    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Blokace se nepodařilo načíst.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await actor();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const body = await request.json();
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Zadejte platný interval (od–do)." }, { status: 400 });
  }

  try {
    await ensureBookingTables();
    const [row] = await getDb()
      .insert(bookingBlocks)
      .values({
        ownerId: user.id,
        startsAt,
        endsAt,
        reason: body.reason?.trim() || null,
      })
      .returning();
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Blokaci se nepodařilo přidat.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const user = await actor();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Chybí id blokace." }, { status: 400 });

  try {
    await ensureBookingTables();
    const db = getDb();
    const [row] = await db.select().from(bookingBlocks).where(eq(bookingBlocks.id, id)).limit(1);
    if (!row || row.ownerId !== user.id) {
      return NextResponse.json({ error: "Blokace nenalezena." }, { status: 404 });
    }
    await db.delete(bookingBlocks).where(eq(bookingBlocks.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Blokaci se nepodařilo smazat.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
