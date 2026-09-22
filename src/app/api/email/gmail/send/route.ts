import { auth } from "@/lib/auth";
import { getFreshGmailAccount, gmailPost } from "@/lib/gmail";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const encodeBase64Url = (value: string) =>
  Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const cleanHeader = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const account = await getFreshGmailAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Gmail není připojený." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const to = cleanHeader(body.to || "");
  const subject = cleanHeader(body.subject || "");
  const text = String(body.body || "").trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [];
  const trackingEnabled = Boolean(body.trackOpen);
  if (!to || !subject || !text) {
    return NextResponse.json({ error: "Doplňte příjemce, předmět a text e-mailu." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const trackingId = trackingEnabled ? crypto.randomUUID() : null;
  const trackingPixel = trackingId ? `\n\n[Tracking ID: ${trackingId}]\n${origin}/api/email/track/${trackingId}` : "";
  const bodyText = `${text}${trackingPixel}`;
  const boundary = `neovia_${crypto.randomUUID().replace(/-/g, "")}`;
  const hasAttachments = attachments.length > 0;
  const message = hasAttachments
    ? [
        `From: ${account.email}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        bodyText,
        ...attachments.flatMap((file: { name?: string; type?: string; data?: string }) => [
          "",
          `--${boundary}`,
          `Content-Type: ${cleanHeader(file.type || "application/octet-stream")}; name="${cleanHeader(file.name || "priloha")}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${cleanHeader(file.name || "priloha")}"`,
          "",
          String(file.data || "").split(",").pop() || "",
        ]),
        "",
        `--${boundary}--`,
      ].join("\r\n")
    : [
        `From: ${account.email}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        bodyText,
      ].join("\r\n");

  const sent = await gmailPost<{ id: string; threadId: string }>(account.accessToken, "/messages/send", {
    raw: encodeBase64Url(message),
  });
  return NextResponse.json({ ok: true, id: sent.id, threadId: sent.threadId, trackingId });
}
