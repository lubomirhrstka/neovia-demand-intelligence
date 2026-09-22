import { auth } from "@/lib/auth";
import { getFreshCalendarAccount, googleCalendarConfig, googleCalendarScopes } from "@/lib/google-calendar";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const config = googleCalendarConfig();
  const account = await getFreshCalendarAccount(session.user.id).catch(() => null);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: googleCalendarScopes.join(" "),
    state: session.user.id,
  });

  return NextResponse.json({
    provider: "google_calendar",
    configured: config.configured,
    connected: Boolean(account?.accessToken || account?.refreshToken),
    account: account?.email || session.user.email,
    scopes: googleCalendarScopes,
    redirectUri: config.redirectUri,
    oauthUrl: config.configured ? `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` : null,
    missing: [
      !config.clientId ? "GOOGLE_CALENDAR_CLIENT_ID nebo GOOGLE_CLIENT_ID" : "",
      !config.clientSecret ? "GOOGLE_CALENDAR_CLIENT_SECRET nebo GOOGLE_CLIENT_SECRET" : "",
    ].filter(Boolean),
    mode: account ? "Google kalendář je připojený" : config.configured ? "OAuth připraven, čeká na připojení účtu" : "Čeká na Google Calendar OAuth údaje",
    connectedAt: account?.connectedAt || null,
    lastSyncAt: account?.lastSyncAt || null,
  });
}
