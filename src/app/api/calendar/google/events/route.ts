import { auth } from "@/lib/auth";
import { calendarFetch, getFreshCalendarAccount } from "@/lib/google-calendar";
import { emailAccounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type GoogleCalendarEvents = {
  items?: Array<{
    id: string;
    summary?: string;
    description?: string;
    htmlLink?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }>;
};

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const account = await getFreshCalendarAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ connected: false, events: [] });

  const url = new URL(request.url);
  const now = new Date();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const timeMinDate = from ? new Date(from) : now;
  const timeMaxDate = to ? new Date(to) : new Date(now.getTime() + 1000 * 60 * 60 * 24 * 45);
  const timeMin = encodeURIComponent(Number.isNaN(timeMinDate.getTime()) ? now.toISOString() : timeMinDate.toISOString());
  const timeMax = encodeURIComponent(Number.isNaN(timeMaxDate.getTime()) ? new Date(now.getTime() + 1000 * 60 * 60 * 24 * 45).toISOString() : timeMaxDate.toISOString());
  const data = await calendarFetch<GoogleCalendarEvents>(
    account.accessToken,
    `/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${timeMin}&timeMax=${timeMax}`,
  );
  await getDb().update(emailAccounts).set({ lastSyncAt: new Date(), updatedAt: new Date() }).where(eq(emailAccounts.id, account.id));

  return NextResponse.json({
    connected: true,
    account: account.email,
    events: (data.items || []).map((item) => ({
      id: item.id,
      title: item.summary || "Událost bez názvu",
      description: item.description || "",
      start: item.start?.dateTime || item.start?.date || null,
      end: item.end?.dateTime || item.end?.date || null,
      link: item.htmlLink || "",
    })),
  });
}
