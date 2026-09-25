import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { calendarFetch, calendarPatch, calendarPost, getFreshCalendarAccount } from "@/lib/google-calendar";
import { activities, auditLog, emailAccounts, ignoredCalendarEvents, tasks } from "@/lib/schema";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const LOCAL_SYNC_BATCH_SIZE = 10;

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  updated?: string;
};

type GoogleCalendarEvents = {
  items?: GoogleCalendarEvent[];
};

function eventStart(item: GoogleCalendarEvent) {
  const value = item.start?.dateTime || item.start?.date;
  return value ? new Date(value) : null;
}

function taskPayload(task: typeof tasks.$inferSelect) {
  const start = task.dueAt ? new Date(task.dueAt) : new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    summary: task.title,
    description: [
      "NEOVIA Demand Intelligence",
      `Typ: ${task.kind === "meeting" ? "schůzka" : task.kind === "note" ? "poznámka" : "úkol"}`,
      task.tag ? `Štítek: ${task.tag}` : "",
      `Priorita: ${task.priority}`,
      `Stav: ${task.status === "done" ? "hotovo" : "otevřeno"}`,
    ].filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const account = await getFreshCalendarAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Google kalendář není připojený." }, { status: 409 });

  const db = getDb();
  const now = new Date();
  const timeMin = encodeURIComponent(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  const timeMax = encodeURIComponent(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString());
  let data: GoogleCalendarEvents;
  try {
    data = await calendarFetch<GoogleCalendarEvents>(
      account.accessToken,
      `/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${timeMin}&timeMax=${timeMax}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar API volání selhalo.";
    return NextResponse.json({ error: message.includes("Rate Limit") ? "Google dočasně omezil počet požadavků. Zkuste synchronizaci za chvíli znovu." : message }, { status: 429 });
  }

  let imported = 0;
  let updatedFromGoogle = 0;
  let pushed = 0;
  let updatedInGoogle = 0;
  let skippedForNextBatch = 0;
  let googleErrors = 0;

  const ignoredRows = await db
    .select({ externalId: ignoredCalendarEvents.externalId })
    .from(ignoredCalendarEvents)
    .where(and(eq(ignoredCalendarEvents.ownerId, session.user.id), eq(ignoredCalendarEvents.provider, "google_calendar")));
  const ignoredIds = new Set(ignoredRows.map((row) => row.externalId));

  for (const item of data.items || []) {
    if (!item.id || item.status === "cancelled") continue;
    if (ignoredIds.has(item.id)) continue;
    const startsAt = eventStart(item);
    if (!startsAt) continue;
    const [existing] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.createdById, session.user.id), eq(tasks.externalProvider, "google_calendar"), eq(tasks.externalId, item.id)))
      .limit(1);
    if (existing) {
      await db.update(tasks).set({
        title: item.summary || existing.title,
        kind: existing.kind || "meeting",
        note: item.description || existing.note,
        dueAt: startsAt,
        syncedAt: now,
        updatedAt: now,
      }).where(eq(tasks.id, existing.id));
      updatedFromGoogle += 1;
    } else {
      const [created] = await db.insert(tasks).values({
        title: item.summary || "Událost z Google kalendáře",
        kind: "meeting",
        status: "open",
        priority: 2,
        tag: "Google",
        note: item.description || null,
        dueAt: startsAt,
        assigneeId: session.user.id,
        createdById: session.user.id,
        externalProvider: "google_calendar",
        externalId: item.id,
        syncedAt: now,
      }).returning();
      await db.insert(activities).values({
        type: "meeting",
        subject: created.title,
        note: "Importováno z Google kalendáře.",
        occurredAt: startsAt,
        authorId: session.user.id,
      });
      await db.insert(auditLog).values({ entityType: "task", entityId: created.id, action: "calendar_imported", after: created, actorId: session.user.id });
      imported += 1;
    }
  }

  const localRows = await db
    .select()
    .from(tasks)
    .where(and(
      or(eq(tasks.assigneeId, session.user.id), eq(tasks.createdById, session.user.id)),
      isNotNull(tasks.dueAt),
    ));

  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const localCandidates = localRows
    .filter((task) => {
      if (!task.dueAt) return false;
      if (task.dueAt < windowStart || task.dueAt > windowEnd) return false;
      if (task.status === "done" || task.status === "archived" || task.status === "cancelled") return false;
      if (task.externalProvider && task.externalProvider !== "google_calendar") return false;
      if (!task.externalId) return true;
      if (!task.syncedAt) return true;
      return task.updatedAt > task.syncedAt;
    })
    .sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime());
  const batch = localCandidates.slice(0, LOCAL_SYNC_BATCH_SIZE);
  skippedForNextBatch = Math.max(0, localCandidates.length - batch.length);

  for (const task of batch) {
    const payload = taskPayload(task);
    try {
      if (task.externalId) {
        await calendarPatch(account.accessToken, `/calendars/primary/events/${encodeURIComponent(task.externalId)}`, payload);
        await db.update(tasks).set({ syncedAt: now, updatedAt: now }).where(eq(tasks.id, task.id));
        updatedInGoogle += 1;
      } else {
        const event = await calendarPost<{ id: string; htmlLink?: string }>(account.accessToken, "/calendars/primary/events", payload);
        await db.update(tasks).set({
          externalProvider: "google_calendar",
          externalId: event.id,
          syncedAt: now,
          updatedAt: now,
        }).where(eq(tasks.id, task.id));
        pushed += 1;
      }
    } catch (error) {
      googleErrors += 1;
      if (error instanceof Error && error.message.includes("Rate Limit")) break;
    }
  }

  await db.update(emailAccounts).set({ lastSyncAt: now, updatedAt: now }).where(eq(emailAccounts.id, account.id));

  return NextResponse.json({
    ok: true,
    imported,
    updatedFromGoogle,
    pushed,
    updatedInGoogle,
    skippedForNextBatch,
    googleErrors,
    syncedAt: now,
  });
}
