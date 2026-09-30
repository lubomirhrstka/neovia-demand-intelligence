import { auth } from "@/lib/auth";
import { deleteSeznamMessages, getSeznamImapAccount } from "@/lib/seznam-imap";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const account = await getSeznamImapAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Seznam.cz IMAP není připojený." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === "string" && id.trim()) : [];
  const permanent = body.folder === "trash";
  if (!ids.length) return NextResponse.json({ error: "Nejsou vybrané žádné e-maily." }, { status: 400 });

  try {
    const result = await deleteSeznamMessages(account.email, account.accessToken, ids, { permanent });
    return NextResponse.json({
      ok: true,
      count: result.count,
      message: permanent ? `Trvale smazáno: ${result.count}` : `Přesunuto do koše: ${result.count}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seznam smazání selhalo.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
