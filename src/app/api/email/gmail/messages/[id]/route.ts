import { auth } from "@/lib/auth";
import { getFreshGmailAccount, gmailFetch } from "@/lib/gmail";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  partId?: string;
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
};

const getHeader = (message: GmailMessage, name: string) =>
  message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";

const decodeBody = (data?: string) => {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
};

const textFromPart = (part?: GmailPart): string => {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBody(part.body.data);
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBody(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  for (const child of part.parts || []) {
    const text = textFromPart(child);
    if (text) return text;
  }
  return "";
};

const parseSender = (from: string) => {
  const match = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { name: from || "Neznámý odesílatel", email: from || "" };
  return { name: match[1].replace(/^"|"$/g, "").trim() || match[2], email: match[2] };
};

const attachmentsFromPart = (part?: GmailPart): { id: string; filename: string; mimeType: string; size: number }[] => {
  if (!part) return [];
  const current = part.filename && part.body?.attachmentId
    ? [{ id: part.body.attachmentId, filename: part.filename, mimeType: part.mimeType || "application/octet-stream", size: part.body.size || 0 }]
    : [];
  return [...current, ...(part.parts || []).flatMap(attachmentsFromPart)];
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const account = await getFreshGmailAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ error: "Gmail není připojený." }, { status: 409 });

  const { id } = await params;
  const message = await gmailFetch<GmailMessage>(
    account.accessToken,
    `/messages/${encodeURIComponent(id)}?format=full`,
  );
  const sender = parseSender(getHeader(message, "From"));
  return NextResponse.json({
    id: message.id,
    threadId: message.threadId,
    subject: getHeader(message, "Subject") || "(bez předmětu)",
    from: sender.name,
    fromEmail: sender.email,
    to: getHeader(message, "To"),
    date: getHeader(message, "Date"),
    snippet: message.snippet || "",
    body: textFromPart(message.payload) || message.snippet || "",
    attachments: attachmentsFromPart(message.payload),
    labels: message.labelIds || [],
  });
}
