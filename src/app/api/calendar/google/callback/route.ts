import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { exchangeCalendarCodeForTokens, googleProfile } from "@/lib/google-calendar";
import { emailAccounts } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  if (error) return NextResponse.redirect(`${url.origin}/#Úkoly?calendar=error&reason=${encodeURIComponent(error)}`);
  if (!code) return NextResponse.redirect(`${url.origin}/#Úkoly?calendar=missing-code`);

  const session = await auth.api.getSession({ headers: await headers() });
  const ownerId = session?.user?.id || state;
  if (!ownerId) return NextResponse.redirect(`${url.origin}/#Úkoly?calendar=missing-user`);

  try {
    const tokens = await exchangeCalendarCodeForTokens(code);
    const profile = await googleProfile(tokens.access_token).catch(() => ({ email: "google-calendar", name: "Google Calendar" }));
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    const db = getDb();
    const [existing] = await db
      .select()
      .from(emailAccounts)
      .where(and(eq(emailAccounts.ownerId, ownerId), eq(emailAccounts.provider, "google_calendar")))
      .limit(1);
    const payload = {
      email: profile.email || existing?.email || "google-calendar",
      displayName: profile.name || existing?.displayName || "Google Calendar",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || existing?.refreshToken || null,
      scope: tokens.scope || null,
      tokenType: tokens.token_type || null,
      expiresAt,
      connectedAt: new Date(),
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(emailAccounts).set(payload).where(eq(emailAccounts.id, existing.id));
    } else {
      await db.insert(emailAccounts).values({ ...payload, provider: "google_calendar", ownerId });
    }
    return NextResponse.redirect(`${url.origin}/#Úkoly?calendar=connected`);
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : "calendar-callback-failed";
    return NextResponse.redirect(`${url.origin}/#Úkoly?calendar=error&reason=${encodeURIComponent(message)}`);
  }
}
