import { auth } from "@/lib/auth";
import { fetchSeznamAttachment, getSeznamImapAccount } from "@/lib/seznam-imap";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const account = await getSeznamImapAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Seznam.cz IMAP není připojený." }, { status: 409 });

  const { id, attachmentId } = await params;
  const url = new URL(request.url);
  const fallbackName = url.searchParams.get("filename") || "priloha";

  try {
    const file = await fetchSeznamAttachment(
      account.email,
      account.accessToken,
      decodeURIComponent(id),
      decodeURIComponent(attachmentId),
    );
    const filename = file.filename || fallbackName;
    return new NextResponse(new Uint8Array(file.content), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Přílohu se nepodařilo stáhnout.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
