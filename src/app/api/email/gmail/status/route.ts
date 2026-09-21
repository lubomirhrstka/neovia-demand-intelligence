import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const scopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const redirectUri =
    process.env.GOOGLE_GMAIL_REDIRECT_URI ||
    `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/email/gmail/callback`;
  const configured = Boolean(clientId && (process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET));
  const params = new URLSearchParams({
    client_id: clientId || "",
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: scopes.join(" "),
    state: session.user.id,
  });

  return NextResponse.json({
    provider: "gmail",
    configured,
    connected: false,
    account: session.user.email,
    scopes,
    redirectUri,
    oauthUrl: configured ? `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` : null,
    missing: [
      !clientId ? "GOOGLE_GMAIL_CLIENT_ID" : "",
      !(process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET) ? "GOOGLE_GMAIL_CLIENT_SECRET" : "",
    ].filter(Boolean),
    mode: configured ? "OAuth připraven, čeká na callback a uložení tokenu" : "Čeká na Google OAuth údaje",
  });
}
