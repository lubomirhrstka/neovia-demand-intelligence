import { auth } from "@/lib/auth";
import { getFreshGmailAccount, gmailFetch } from "@/lib/gmail";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const decodeBase64Url = (data: string) => Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const account = await getFreshGmailAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Gmail není připojený." }, { status: 409 });
  const { id, attachmentId } = await params;
  const url = new URL(request.url);
  const filename = url.searchParams.get("filename") || "priloha";
  const attachment = await gmailFetch<{ data: string; size: number }>(
    account.accessToken,
    `/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  const bytes = decodeBase64Url(attachment.data);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
