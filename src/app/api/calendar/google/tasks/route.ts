import { auth } from "@/lib/auth";
import { calendarPatch, calendarPost, getFreshCalendarAccount } from "@/lib/google-calendar";
import { companies, contacts, opportunities, tasks } from "@/lib/schema";
import { aliasedTable } from "drizzle-orm/alias";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  if (!body.taskId) return NextResponse.json({ error: "Chybí úkol pro kalendář." }, { status: 400 });

  const account = await getFreshCalendarAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Google kalendář není připojený." }, { status: 409 });

  const taskCompanies = aliasedTable(companies, "task_calendar_company");
  const [task] = await getDb()
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
    .where(and(eq(tasks.id, body.taskId), or(eq(tasks.assigneeId, session.user.id), eq(tasks.createdById, session.user.id))))
    .limit(1);

  if (!task) return NextResponse.json({ error: "Úkol nebyl nalezen." }, { status: 404 });
  if (!task.dueAt) return NextResponse.json({ error: "Úkol nemá termín, nelze ho poslat do kalendáře." }, { status: 400 });

  const start = new Date(task.dueAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const payload = {
    summary: task.title,
    description: [
      "NEOVIA Demand Intelligence",
      `Typ: ${task.kind === "meeting" ? "schůzka" : task.kind === "note" ? "poznámka" : "úkol"}`,
      task.company || task.directCompany ? `Firma: ${task.company || task.directCompany}` : "",
      [task.contactFirstName, task.contactLastName].filter(Boolean).join(" ") || task.contactEmail
        ? `Kontakt: ${[task.contactFirstName, task.contactLastName].filter(Boolean).join(" ") || task.contactEmail}`
        : "",
      task.opportunityTitle ? `Obchodní případ: ${task.opportunityTitle}` : "",
      task.tag ? `Štítek: ${task.tag}` : "",
      `Priorita: ${task.priority}`,
      `Stav: ${task.status === "done" ? "hotovo" : "otevřeno"}`,
    ].filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
  const event = task.externalProvider === "google_calendar" && task.externalId
    ? await calendarPatch<{ id: string; htmlLink?: string }>(account.accessToken, `/calendars/primary/events/${encodeURIComponent(task.externalId)}`, payload)
    : await calendarPost<{ id: string; htmlLink?: string }>(account.accessToken, "/calendars/primary/events", payload);

  await getDb().update(tasks).set({
    externalProvider: "google_calendar",
    externalId: event.id,
    syncedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(tasks.id, task.id));

  return NextResponse.json({ ok: true, eventId: event.id, link: event.htmlLink || "" });
}
