import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { auditLog, companies, opportunities, tasks } from "@/lib/schema";
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
  const rows = await getDb()
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      opportunityId: tasks.opportunityId,
      opportunityTitle: opportunities.title,
      company: companies.name,
    })
    .from(tasks)
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .leftJoin(companies, eq(opportunities.companyId, companies.id))
    .where(or(eq(tasks.assigneeId, user.id), eq(tasks.createdById, user.id)))
    .orderBy(desc(tasks.dueAt));
  return NextResponse.json(rows);
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
  const [created] = await getDb().insert(tasks).values({ title: body.title.trim(), priority: Number(body.priority || 2), dueAt: body.dueAt ? new Date(body.dueAt) : null, assigneeId: body.assigneeId || user.id, createdById: user.id, contactId: body.contactId || null, opportunityId: body.opportunityId || null }).returning();
  await getDb().insert(auditLog).values({ entityType: "task", entityId: created.id, action: "created", after: created, actorId: user.id });
  return NextResponse.json(created, { status: 201 });
}
