import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { testSeznamImapLogin } from "@/lib/seznam-imap";
import { emailAccounts } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  const email = (body.email || "").trim();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json({ error: "Zadejte e-mail i heslo (u seznam.cz doporučujeme aplikační heslo)." }, { status: 400 });
  }

  try {
    await testSeznamImapLogin(email, password);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Přihlášení k seznam.cz selhalo.";
    return NextResponse.json({ error: `Nepodařilo se přihlásit: ${message}` }, { status: 400 });
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
