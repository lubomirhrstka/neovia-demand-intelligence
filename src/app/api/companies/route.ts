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
const normalize = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ");
const normalizeText = (value: unknown) =>
  normalize(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const companyKey = (value: string) =>
  normalizeText(value)
    .replace(/\bspol\.?\s*s\.?\s*r\.?\s*o\.?\b/g, " ")
    .replace(/\bs\.?\s*r\.?\s*o\.?\b/g, " ")
    .replace(/\ba\.?\s*s\.?\b/g, " ")
    .replace(/\bk\.?\s*s\.?\b/g, " ")
    .replace(/\bv\.?\s*o\.?\s*s\.?\b/g, " ")
    .replace(/\b(ltd|limited|inc|corp|corporation|gmbh|llc)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
const sameCompanyIdentity = (left: { name: string; ico?: string | null; website?: string | null }, right: { name: string; ico?: string | null; website?: string | null }) => {
  const leftKey = companyKey(left.name);
  const rightKey = companyKey(right.name);
  const sameName = leftKey.length > 3 && rightKey.length > 3 && (leftKey === rightKey || (Math.min(leftKey.length, rightKey.length) >= 5 && (leftKey.includes(rightKey) || rightKey.includes(leftKey))));
  const sameIco = Boolean(left.ico && right.ico && normalize(left.ico) === normalize(right.ico));
  const leftDomain = domainFrom(left.website || "");
  const rightDomain = domainFrom(right.website || "");
  const sameDomain = Boolean(leftDomain && rightDomain && leftDomain === rightDomain);
  return sameName || sameIco || sameDomain;
};
const domainFrom = (value: string) => {
  const text = normalize(value).toLowerCase();
  const url = text.match(/https?:\/\/([^/\s]+)/)?.[1] || text.match(/(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/)?.[1] || "";
  return url.replace(/^www\./, "");
};

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
    });
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
    });
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
