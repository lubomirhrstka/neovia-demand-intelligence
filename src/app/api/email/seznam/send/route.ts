import { auth } from "@/lib/auth";
import { getSeznamImapAccount, sendSeznamEmail } from "@/lib/seznam-imap";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const cleanHeader = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const account = await getSeznamImapAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Seznam.cz není připojený." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const to = cleanHeader(body.to || "");
  const subject = cleanHeader(body.subject || "");
  const text = String(body.body || "").trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [];
  if (!to || !subject || !text) {
    return NextResponse.json({ error: "Doplňte příjemce, předmět a text e-mailu." }, { status: 400 });
  }

  try {
    const sent = await sendSeznamEmail(account.email, account.accessToken, {
      to,
      subject,
      body: text,
      attachments,
    });
    return NextResponse.json({ ok: true, id: sent.messageId, accepted: sent.accepted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odeslání přes Seznam SMTP selhalo.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
