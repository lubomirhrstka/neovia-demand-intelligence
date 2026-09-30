import { auth } from "@/lib/auth";
import { getSeznamImapAccount } from "@/lib/seznam-imap";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const account = await getSeznamImapAccount(session.user.id);
  return NextResponse.json({
    connected: Boolean(account),
    email: account?.email || null,
    lastSyncAt: account?.lastSyncAt || null,
  });
}
