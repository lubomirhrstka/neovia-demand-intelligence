import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { testSeznamImapLogin } from "@/lib/seznam-imap";
import { emailAccounts } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const SEZNAM_EMAIL_DOMAINS = ["seznam.cz", "email.cz", "post.cz"];

function isSupportedSeznamEmail(email: string) {
  const normalized = email.toLowerCase();
  return SEZNAM_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

function formatSeznamLoginError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "";
  const message = rawMessage.toLowerCase();
  if (message.includes("authentication") || message.includes("auth") || message.includes("login") || message.includes("credential")) {
    return "Seznam.cz přihlášení odmítl. Zadejte celý e-mail u seznam.cz/email.cz/post.cz a použijte aplikační heslo ze Seznam účtu, ne běžné heslo ani Gmail heslo.";
  }
  if (message.includes("timeout") || message.includes("timed out") || message.includes("network") || message.includes("enotfound")) {
    return "Nepodařilo se spojit se Seznam IMAP serverem. Zkuste to prosím znovu a ověřte, že je pro schránku povolený IMAP přístup.";
  }
  return "Připojení přes IMAP se nepodařilo. Zkontrolujte prosím e-mail, aplikační heslo a zapnutý IMAP ve schránce Seznam.cz.";
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  const email = (body.email || "").trim();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json({ error: "Zadejte e-mail i heslo (u seznam.cz doporučujeme aplikační heslo)." }, { status: 400 });
  }
  if (!isSupportedSeznamEmail(email)) {
    return NextResponse.json(
      {
        error:
          "Tento konektor je pouze pro schránky seznam.cz, email.cz nebo post.cz. Gmail připojte přes Gmail konektor v e-mailovém klientu.",
      },
      { status: 400 },
    );
  }

  try {
    await testSeznamImapLogin(email, password);
  } catch (error) {
    return NextResponse.json({ error: formatSeznamLoginError(error) }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: emailAccounts.id })
    .from(emailAccounts)
    .where(and(eq(emailAccounts.ownerId, session.user.id), eq(emailAccounts.provider, "seznam_imap")))
    .limit(1);
  const values = {
    provider: "seznam_imap" as const,
    email,
    accessToken: password,
    connectedAt: new Date(),
    lastSyncAt: null,
    ownerId: session.user.id,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(emailAccounts).set(values).where(eq(emailAccounts.id, existing.id));
  } else {
    await db.insert(emailAccounts).values(values);
  }

  return NextResponse.json({ ok: true, email });
}

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  await getDb()
    .delete(emailAccounts)
    .where(and(eq(emailAccounts.ownerId, session.user.id), eq(emailAccounts.provider, "seznam_imap")));
  return NextResponse.json({ ok: true });
}
