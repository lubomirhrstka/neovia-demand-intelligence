import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { auditLog, companies, contacts, demands, opportunities } from "@/lib/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const rows = await getDb()
    .select({
      id: companies.id,
      name: companies.name,
      ico: companies.ico,
      website: companies.website,
      sector: companies.sector,
      source: companies.source,
      updatedAt: companies.updatedAt,
      contactsCount: sql<number>`count(distinct ${contacts.id})::int`,
      demandsCount: sql<number>`count(distinct ${demands.id})::int`,
      opportunitiesCount: sql<number>`count(distinct ${opportunities.id})::int`,
    })
    .from(companies)
    .leftJoin(contacts, eq(contacts.companyId, companies.id))
    .leftJoin(demands, eq(demands.companyId, companies.id))
    .leftJoin(opportunities, eq(opportunities.companyId, companies.id))
    .where(eq(companies.ownerId, user.id))
    .groupBy(companies.id)
    .orderBy(desc(companies.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Doplňte název firmy." }, { status: 400 });
  const db = getDb();
  const [existing] = await db.select().from(companies).where(and(eq(companies.ownerId, user.id), eq(companies.name, body.name.trim()))).limit(1);
  if (existing) return NextResponse.json({ error: "Firma s tímto názvem už existuje." }, { status: 409 });
  const [created] = await db.insert(companies).values({
    name: body.name.trim(),
    ico: body.ico?.trim() || null,
    website: body.website?.trim() || null,
    sector: body.sector?.trim() || null,
    source: body.source?.trim() || "Ručně",
    ownerId: user.id,
  }).returning();
  await db.insert(auditLog).values({ entityType: "company", entityId: created.id, action: "created", after: created, actorId: user.id });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.id || !body.name?.trim()) return NextResponse.json({ error: "Doplňte název firmy." }, { status: 400 });
  const db = getDb();
  const [current] = await db.select().from(companies).where(and(eq(companies.id, body.id), eq(companies.ownerId, user.id))).limit(1);
  if (!current) return NextResponse.json({ error: "Firemní karta nebyla nalezena." }, { status: 404 });
  const [duplicate] = await db.select().from(companies).where(and(eq(companies.ownerId, user.id), eq(companies.name, body.name.trim()))).limit(1);
  if (duplicate && duplicate.id !== body.id) return NextResponse.json({ error: "Jiná firma s tímto názvem už existuje." }, { status: 409 });
  const [updated] = await db.update(companies).set({
    name: body.name.trim(),
    ico: body.ico?.trim() || null,
    website: body.website?.trim() || null,
    sector: body.sector?.trim() || null,
    source: body.source?.trim() || current.source || "Ručně",
    updatedAt: new Date(),
  }).where(and(eq(companies.id, body.id), eq(companies.ownerId, user.id))).returning();
  await db.insert(auditLog).values({ entityType: "company", entityId: updated.id, action: "updated", before: current, after: updated, actorId: user.id });
  return NextResponse.json(updated);
}
