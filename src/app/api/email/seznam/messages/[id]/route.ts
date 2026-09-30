import { auth } from "@/lib/auth";
import { fetchSeznamMessage, getSeznamImapAccount } from "@/lib/seznam-imap";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const account = await getSeznamImapAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Seznam.cz IMAP není připojený." }, { status: 409 });

  const { id } = await params;
  try {
    const detail = await fetchSeznamMessage(account.email, account.accessToken, decodeURIComponent(id));
    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Detail Seznam e-mailu se nepodařilo načíst.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
