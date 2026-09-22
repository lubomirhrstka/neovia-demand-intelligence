import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activities, auditLog, companies, contacts, opportunities, tasks } from "@/lib/schema";
import { aliasedTable } from "drizzle-orm/alias";
import { and, desc, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const taskCompanies = aliasedTable(companies, "task_company");
  const rows = await getDb()
    .select({
      id: tasks.id,
      title: tasks.title,
      kind: tasks.kind,
      status: tasks.status,
      priority: tasks.priority,
      tag: tasks.tag,
      dueAt: tasks.dueAt,
      externalProvider: tasks.externalProvider,
      externalId: tasks.externalId,
      syncedAt: tasks.syncedAt,
      contactId: tasks.contactId,
      companyId: tasks.companyId,
      opportunityId: tasks.opportunityId,
      opportunityTitle: opportunities.title,
      company: companies.name,
      directCompany: taskCompanies.name,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
    })
    .from(tasks)
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .leftJoin(companies, eq(opportunities.companyId, companies.id))
    .leftJoin(taskCompanies, eq(tasks.companyId, taskCompanies.id))
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .where(or(eq(tasks.assigneeId, user.id), eq(tasks.createdById, user.id)))
    .orderBy(desc(tasks.dueAt));
  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      company: row.company || row.directCompany,
      contactName: [row.contactFirstName, row.contactLastName].filter(Boolean).join(" ") || row.contactEmail || null,
    })),
  );
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "Úkol musí mít název." }, { status: 400 });
  if (body.opportunityId) {
    const [existing] = await getDb()
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.createdById, user.id),
          eq(tasks.opportunityId, body.opportunityId),
          eq(tasks.title, body.title.trim()),
        ),
      )
      .limit(1);
    if (existing) return NextResponse.json({ ...existing, alreadyExists: true });
  }
  const db = getDb();
  const [created] = await db.insert(tasks).values({
    title: body.title.trim(),
    kind: body.kind || "task",
    priority: Number(body.priority || 2),
    tag: body.tag?.trim() || null,
    dueAt: body.dueAt ? new Date(body.dueAt) : null,
    assigneeId: body.assigneeId || user.id,
    createdById: user.id,
    contactId: body.contactId || null,
    companyId: body.companyId || null,
    opportunityId: body.opportunityId || null,
  }).returning();
  await db.insert(auditLog).values({ entityType: "task", entityId: created.id, action: "created", after: created, actorId: user.id });
  if (created.contactId || created.companyId || created.opportunityId) {
    await db.insert(activities).values({
      type: created.kind || "task",
      subject: created.title,
      note: [
        "Založeno z úkolů/kalendáře.",
        created.tag ? `Štítek: ${created.tag}` : "",
        `Priorita: ${created.priority}`,
      ].filter(Boolean).join(" "),
      occurredAt: created.dueAt || new Date(),
      contactId: created.contactId,
      companyId: created.companyId,
      opportunityId: created.opportunityId,
      authorId: user.id,
    });
  }
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Chybí ID úkolu." }, { status: 400 });
  const allowed = ["open", "done"];
  if (body.status && !allowed.includes(body.status)) return NextResponse.json({ error: "Neplatný stav úkolu." }, { status: 400 });
  const db = getDb();
  const [current] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, body.id), or(eq(tasks.assigneeId, user.id), eq(tasks.createdById, user.id))))
    .limit(1);
  if (!current) return NextResponse.json({ error: "Úkol nebyl nalezen." }, { status: 404 });
  const [updated] = await db
    .update(tasks)
    .set({
      ...(body.status ? { status: body.status } : {}),
      ...(body.title !== undefined ? { title: body.title || current.title } : {}),
      ...(body.kind !== undefined ? { kind: body.kind || current.kind || "task" } : {}),
      ...(body.priority !== undefined ? { priority: Number(body.priority || 2) } : {}),
      ...(body.tag !== undefined ? { tag: body.tag?.trim() || null } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      ...(body.companyId !== undefined ? { companyId: body.companyId || null } : {}),
      ...(body.contactId !== undefined ? { contactId: body.contactId || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, current.id))
    .returning();
  await db.insert(auditLog).values({ entityType: "task", entityId: updated.id, action: "updated", before: current, after: updated, actorId: user.id });
  if (updated.contactId || updated.companyId || updated.opportunityId) {
    await db.insert(activities).values({
      type: updated.kind || "task",
      subject: updated.title,
      note: [
        "Aktualizace úkolu/kalendářového záznamu.",
        updated.tag ? `Štítek: ${updated.tag}` : "",
        updated.status === "done" ? "Stav: hotovo" : "Stav: otevřeno",
      ].filter(Boolean).join(" "),
      occurredAt: updated.dueAt || new Date(),
      contactId: updated.contactId,
      companyId: updated.companyId,
      opportunityId: updated.opportunityId,
      authorId: user.id,
    });
  }
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Chybí ID úkolu." }, { status: 400 });
  const db = getDb();
  const [current] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, body.id), or(eq(tasks.assigneeId, user.id), eq(tasks.createdById, user.id))))
    .limit(1);
  if (!current) return NextResponse.json({ error: "Záznam nebyl nalezen." }, { status: 404 });
  await db.insert(auditLog).values({ entityType: "task", entityId: current.id, action: "deleted", before: current, actorId: user.id });
  await db.delete(tasks).where(eq(tasks.id, current.id));
  return NextResponse.json({ ok: true });
}
