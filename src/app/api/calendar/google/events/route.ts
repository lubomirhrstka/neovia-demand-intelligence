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

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const account = await getFreshCalendarAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ connected: false, events: [] });

  const timeMin = encodeURIComponent(new Date().toISOString());
  const data = await calendarFetch<GoogleCalendarEvents>(
    account.accessToken,
    `/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10&timeMin=${timeMin}`,
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
