import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sameCompanyIdentity } from "@/lib/matching";
import { auditLog, companies, contactDuplicates, contacts } from "@/lib/schema";
import { and, desc, eq, or, type SQL } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user;
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

async function findOrCreateCompany(db: ReturnType<typeof getDb>, userId: string, body: { company: string; source?: string }) {
  const sourceTag = body.source || "Ručně";
  const existingCompanies = await db.select().from(companies).where(eq(companies.ownerId, userId));
  const existingCompany = existingCompanies.find((company) =>
    sameCompanyIdentity(company, { name: body.company.trim() }).same,
  );
  const company =
    existingCompany ||
    (await db.insert(companies).values({ name: body.company.trim(), source: sourceTag, ownerId: userId }).returning())[0];
  if (existingCompany && !existingCompany.source) {
    await db.update(companies).set({ source: sourceTag, updatedAt: new Date() }).where(eq(companies.id, existingCompany.id));
  }
  return company;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const rows = await getDb().select({ id: contacts.id, companyId: contacts.companyId, firstName: contacts.firstName, lastName: contacts.lastName, role: contacts.role, email: contacts.email, secondaryEmail: contacts.secondaryEmail, phone: contacts.phone, secondaryPhone: contacts.secondaryPhone, source: contacts.source, verified: contacts.verified, updatedAt: contacts.updatedAt, company: companies.name, companySource: companies.source }).from(contacts).leftJoin(companies, eq(contacts.companyId, companies.id)).where(eq(contacts.ownerId, user.id)).orderBy(desc(contacts.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.firstName || !body.lastName || !body.company || (!body.email && !body.secondaryEmail && !body.phone && !body.secondaryPhone)) return NextResponse.json({ error: "Doplňte jméno, firmu a alespoň e-mail nebo telefon." }, { status: 400 });
  const db = getDb();
  const matchRules: SQL[] = [];
  const emails = [body.email, body.secondaryEmail].filter(Boolean).map(normalizeEmail);
  const phones = [body.phone, body.secondaryPhone].filter(Boolean).map(normalizePhone).filter(Boolean);
  emails.forEach((email: string) => matchRules.push(or(eq(contacts.email, email), eq(contacts.secondaryEmail, email))!));
  phones.forEach((phone: string) => matchRules.push(or(eq(contacts.phone, phone), eq(contacts.secondaryPhone, phone))!));
  const [duplicate] = matchRules.length ? await db.select().from(contacts).where(and(eq(contacts.ownerId, user.id), or(...matchRules))).limit(1) : [];
  if (duplicate) {
    await db.insert(contactDuplicates).values({ contactId: duplicate.id, candidateId: duplicate.id, score: 100, reason: body.email && duplicate.email === body.email.trim().toLowerCase() ? "Shodný služební e-mail při ručním vložení" : "Shodný služební telefon při ručním vložení" });
    return NextResponse.json({ error: `Možná duplicita: ${duplicate.firstName} ${duplicate.lastName}. Kartu otevřete a doplňte ji místo vytváření nové.` }, { status: 409 });
  }
  const sourceTag = body.source || "Ručně";
  const company = await findOrCreateCompany(db, user.id, { company: body.company, source: sourceTag });
  const [created] = await db.insert(contacts).values({ firstName: body.firstName, lastName: body.lastName, role: body.role || null, email: emails[0] || null, secondaryEmail: emails[1] || null, phone: phones[0] || null, secondaryPhone: phones[1] || null, source: sourceTag, companyId: company.id, ownerId: user.id }).returning();
  await db.insert(auditLog).values({ entityType: "contact", entityId: created.id, action: "created", after: created, actorId: user.id });
  return NextResponse.json({ ...created, company: company.name, companyId: company.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.id || !body.firstName || !body.lastName || !body.company || (!body.email && !body.secondaryEmail && !body.phone && !body.secondaryPhone)) return NextResponse.json({ error: "Doplňte jméno, firmu a alespoň e-mail nebo telefon." }, { status: 400 });
  const db = getDb();
  const [current] = await db.select().from(contacts).where(and(eq(contacts.id, body.id), eq(contacts.ownerId, user.id))).limit(1);
  if (!current) return NextResponse.json({ error: "Kontaktní karta nebyla nalezena." }, { status: 404 });
  const matchRules: SQL[] = [];
  const email = body.email ? normalizeEmail(body.email) : null;
  const secondaryEmail = body.secondaryEmail ? normalizeEmail(body.secondaryEmail) : null;
  const phone = body.phone ? normalizePhone(body.phone) : null;
  const secondaryPhone = body.secondaryPhone ? normalizePhone(body.secondaryPhone) : null;
  [email, secondaryEmail].filter(Boolean).forEach((value) => matchRules.push(or(eq(contacts.email, value!), eq(contacts.secondaryEmail, value!))!));
  [phone, secondaryPhone].filter(Boolean).forEach((value) => matchRules.push(or(eq(contacts.phone, value!), eq(contacts.secondaryPhone, value!))!));
  const [duplicate] = matchRules.length ? await db.select().from(contacts).where(and(eq(contacts.ownerId, user.id), or(...matchRules))).limit(1) : [];
  if (duplicate && duplicate.id !== body.id) {
    await db.insert(contactDuplicates).values({ contactId: current.id, candidateId: duplicate.id, score: 100, reason: "Shoda e-mailu nebo telefonu při úpravě kontaktní karty" });
    return NextResponse.json({ error: `Možná duplicita: ${duplicate.firstName} ${duplicate.lastName}.` }, { status: 409 });
  }
  const sourceTag = body.source || current.source || "Ručně";
  const company = await findOrCreateCompany(db, user.id, { company: body.company, source: sourceTag });
  const [updated] = await db.update(contacts).set({ firstName: body.firstName, lastName: body.lastName, role: body.role || null, email, secondaryEmail, phone, secondaryPhone, source: sourceTag, companyId: company.id, verified: Boolean(body.verified), updatedAt: new Date() }).where(and(eq(contacts.id, body.id), eq(contacts.ownerId, user.id))).returning();
  await db.insert(auditLog).values({ entityType: "contact", entityId: updated.id, action: "updated", before: current, after: updated, actorId: user.id });
  return NextResponse.json({ ...updated, company: company.name, companyId: company.id });
}
