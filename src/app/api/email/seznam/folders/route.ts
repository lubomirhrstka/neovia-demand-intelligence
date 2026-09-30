import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fetchSeznamInboxMessages, getSeznamImapAccount } from "@/lib/seznam-imap";
import { emailAccounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") || "inbox";
  const account = await getSeznamImapAccount(session.user.id);
  if (!account?.accessToken) {
    return NextResponse.json({ connected: false, labels: [], messages: [] });
  }
  if (folder !== "inbox") {
    return NextResponse.json({
      connected: true,
      account: account.email,
      labels: [{ id: "INBOX", name: "Doručené", messagesTotal: 0 }],
      messages: [],
      info: "Seznam IMAP zobrazení zatím načítá pouze Doručené.",
    });
  }

  try {
    const payload = await fetchSeznamInboxMessages(account.email, account.accessToken, 30);
    await getDb().update(emailAccounts).set({ lastSyncAt: new Date(), updatedAt: new Date() }).where(eq(emailAccounts.id, account.id));
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seznam IMAP čtení selhalo.";
    return NextResponse.json({ connected: true, account: account.email, labels: [], messages: [], error: message }, { status: 502 });
  }
}
