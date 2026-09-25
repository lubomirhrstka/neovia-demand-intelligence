import { auth } from "@/lib/auth";
import { getFreshGmailAccount, gmailPost } from "@/lib/gmail";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const account = await getFreshGmailAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Gmail není připojený." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === "string" && id.trim()) : [];
  const permanent = body.folder === "trash";
  if (!ids.length) return NextResponse.json({ error: "Nejsou vybrané žádné e-maily." }, { status: 400 });

  try {
    if (permanent) {
      // Trvalé smazání — položky jsou už v koši, druhé "smazání" je má odstranit navždy.
      await gmailPost(account.accessToken, "/messages/batchDelete", { ids });
      return NextResponse.json({
        ok: true,
        count: ids.length,
        message: `Trvale smazáno: ${ids.length}`,
      });
    }
    // Gmail batch modify: move to TRASH
    await gmailPost(account.accessToken, "/messages/batchModify", {
      ids,
      addLabelIds: ["TRASH"],
      removeLabelIds: ["INBOX", "UNREAD"],
    });
    return NextResponse.json({
      ok: true,
      count: ids.length,
      message: `Přesunuto do koše: ${ids.length}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail smazání selhalo.";
    const needsReauth = message.includes("insufficient") || message.includes("Insufficient") || message.includes("403");
    return NextResponse.json({
      error: needsReauth
        ? "Trvalé smazání vyžaduje širší oprávnění — znovu prosím připojte Gmail v Nastavení."
        : message,
    }, { status: 502 });
  }
}
