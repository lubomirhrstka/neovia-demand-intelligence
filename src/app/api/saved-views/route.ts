import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { savedViews } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function user() {
  return (await auth.api.getSession({ headers: await headers() }))?.user;
}

export async function GET(request: Request) {
  const actor = await user();
  if (!actor) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const view = new URL(request.url).searchParams.get("view");
  if (!view) return NextResponse.json({ error: "Chybí parametr view." }, { status: 400 });
  const rows = await getDb()
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.ownerId, actor.id), eq(savedViews.view, view)))
    .orderBy(desc(savedViews.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const actor = await user();
  if (!actor) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.view || !body.name?.trim()) {
    return NextResponse.json({ error: "Doplňte název pohledu." }, { status: 400 });
  }
  const [row] = await getDb()
    .insert(savedViews)
    .values({ view: body.view, name: body.name.trim(), filters: body.filters || {}, ownerId: actor.id })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(request: Request) {
  const actor = await user();
  if (!actor) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Chybí ID pohledu." }, { status: 400 });
  await getDb()
    .delete(savedViews)
    .where(and(eq(savedViews.id, body.id), eq(savedViews.ownerId, actor.id)));
  return NextResponse.json({ ok: true });
}
