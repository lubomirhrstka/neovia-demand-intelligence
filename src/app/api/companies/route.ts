import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sameCompanyIdentity } from "@/lib/matching";
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
      priority: companies.priority,
      size: companies.size,
      relationshipStatus: companies.relationshipStatus,
      ownerName: companies.ownerName,
      decisionMaker: companies.decisionMaker,
      nextStep: companies.nextStep,
      nextStepDueAt: companies.nextStepDueAt,
      note: companies.note,
      doNotContact: companies.doNotContact,
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
  const existingCompanies = await db.select().from(companies).where(eq(companies.ownerId, user.id));
  const existing = existingCompanies.find((company) => {
    return sameCompanyIdentity(company, {
      name: body.name.trim(),
      ico: body.ico,
      website: body.website,
    }).same;
  });
  if (existing) return NextResponse.json({ error: `Možná duplicita firmy: ${existing.name}. Otevřete existující kartu a doplňte ji.` }, { status: 409 });
  const [created] = await db.insert(companies).values({
    name: body.name.trim(),
    ico: body.ico?.trim() || null,
    website: body.website?.trim() || null,
    sector: body.sector?.trim() || null,
    source: body.source?.trim() || "Ručně",
    priority: body.priority?.trim() || null,
    size: body.size?.trim() || null,
    relationshipStatus: body.relationshipStatus?.trim() || null,
    ownerName: body.ownerName?.trim() || null,
    decisionMaker: body.decisionMaker?.trim() || null,
    nextStep: body.nextStep?.trim() || null,
    nextStepDueAt: body.nextStepDueAt ? new Date(body.nextStepDueAt) : null,
    note: body.note?.trim() || null,
    doNotContact: Boolean(body.doNotContact),
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
  const existingCompanies = await db.select().from(companies).where(eq(companies.ownerId, user.id));
  const duplicate = existingCompanies.find((company) => {
    if (company.id === body.id) return false;
    return sameCompanyIdentity(company, {
      name: body.name.trim(),
      ico: body.ico,
      website: body.website,
    }).same;
  });
  if (duplicate) return NextResponse.json({ error: `Možná duplicita firmy: ${duplicate.name}.` }, { status: 409 });
  const [updated] = await db.update(companies).set({
    name: body.name.trim(),
    ico: body.ico?.trim() || null,
    website: body.website?.trim() || null,
    sector: body.sector?.trim() || null,
    source: body.source?.trim() || current.source || "Ručně",
    priority: body.priority?.trim() || null,
    size: body.size?.trim() || null,
    relationshipStatus: body.relationshipStatus?.trim() || null,
    ownerName: body.ownerName?.trim() || null,
    decisionMaker: body.decisionMaker?.trim() || null,
    nextStep: body.nextStep?.trim() || null,
    nextStepDueAt: body.nextStepDueAt ? new Date(body.nextStepDueAt) : null,
    note: body.note?.trim() || null,
    doNotContact: Boolean(body.doNotContact),
    updatedAt: new Date(),
  }).where(and(eq(companies.id, body.id), eq(companies.ownerId, user.id))).returning();
  await db.insert(auditLog).values({ entityType: "company", entityId: updated.id, action: "updated", before: current, after: updated, actorId: user.id });
  return NextResponse.json(updated);
}
