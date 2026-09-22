import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activities, auditLog, companies, contacts, opportunities, tasks } from "@/lib/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user;
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  const contactId = url.searchParams.get("contactId");
  const opportunityId = url.searchParams.get("opportunityId");
  const filters = [eq(activities.authorId, user.id)];
  if (companyId) filters.push(eq(activities.companyId, companyId));
  if (contactId) filters.push(eq(activities.contactId, contactId));
  if (opportunityId) filters.push(eq(activities.opportunityId, opportunityId));
  const rows = await getDb()
    .select({
      id: activities.id,
      type: activities.type,
      subject: activities.subject,
      note: activities.note,
      occurredAt: activities.occurredAt,
      companyId: activities.companyId,
      company: companies.name,
      contactId: activities.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      opportunityId: activities.opportunityId,
      opportunityTitle: opportunities.title,
    })
    .from(activities)
    .leftJoin(companies, eq(activities.companyId, companies.id))
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .leftJoin(opportunities, eq(activities.opportunityId, opportunities.id))
    .where(and(...filters))
    .orderBy(desc(activities.occurredAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.subject?.trim()) return NextResponse.json({ error: "Doplňte předmět aktivity." }, { status: 400 });
  const db = getDb();
  const companyId = body.companyId || null;
  const contactId = body.contactId || null;
  const opportunityId = body.opportunityId || null;
  if (!companyId && !contactId && !opportunityId) return NextResponse.json({ error: "Aktivita musí být navázaná na firmu, kontakt nebo příležitost." }, { status: 400 });
  if (companyId) {
    const [company] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.ownerId, user.id))).limit(1);
    if (!company) return NextResponse.json({ error: "Firma nebyla nalezena." }, { status: 404 });
  }
  if (contactId) {
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.ownerId, user.id))).limit(1);
    if (!contact) return NextResponse.json({ error: "Kontakt nebyl nalezen." }, { status: 404 });
  }
  if (opportunityId) {
    const [opportunity] = await db.select().from(opportunities).where(and(eq(opportunities.id, opportunityId), eq(opportunities.ownerId, user.id))).limit(1);
    if (!opportunity) return NextResponse.json({ error: "Příležitost nebyla nalezena." }, { status: 404 });
  }
  const [created] = await db.insert(activities).values({
    type: body.type || "note",
    subject: body.subject.trim(),
    note: body.note?.trim() || null,
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    companyId,
    contactId,
    opportunityId,
    authorId: user.id,
  }).returning();
  let createdTask = null;
  if (body.nextStep?.trim() && body.nextStepDueAt) {
    const [task] = await db.insert(tasks).values({
      title: body.nextStep.trim(),
      priority: Number(body.priority || 2),
      dueAt: new Date(body.nextStepDueAt),
      assigneeId: user.id,
      createdById: user.id,
      contactId,
      companyId,
      opportunityId,
    }).returning();
    createdTask = task;
  }
  await db.insert(auditLog).values({ entityType: "activity", entityId: created.id, action: "created", after: { created, createdTask }, actorId: user.id });
  return NextResponse.json({ activity: created, task: createdTask }, { status: 201 });
}
