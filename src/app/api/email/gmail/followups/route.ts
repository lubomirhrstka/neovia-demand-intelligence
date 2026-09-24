import { auth } from "@/lib/auth";
import { getFreshGmailAccount, gmailFetch } from "@/lib/gmail";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type GmailMessageList = { messages?: { id: string; threadId: string }[] };
type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: { name: string; value: string }[] };
};
type GmailThread = { messages?: GmailMessage[] };

const getHeader = (message: GmailMessage, name: string) =>
  message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";

const FOLLOWUP_AFTER_DAYS = 3;

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const account = await getFreshGmailAccount(session.user.id);
  if (!account?.accessToken) return NextResponse.json({ connected: false, items: [] });

  try {
    const list = await gmailFetch<GmailMessageList>(account.accessToken, "/messages?maxResults=25&labelIds=SENT");
    const cutoff = Date.now() - FOLLOWUP_AFTER_DAYS * 24 * 60 * 60 * 1000;
    const items: {
      id: string;
      threadId: string;
      subject: string;
      to: string;
      sentAt: string;
      daysSinceSent: number;
    }[] = [];

    for (const ref of list.messages || []) {
      const detail = await gmailFetch<GmailMessage>(
        account.accessToken,
        `/messages/${ref.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      const sentAtMs = Number(detail.internalDate || 0);
      if (!sentAtMs || sentAtMs > cutoff) continue;

      // zjistíme, jestli po odeslání přišla v tomtéž vlákně odpověď (zpráva s INBOX novější než odeslání)
      const thread = await gmailFetch<GmailThread>(account.accessToken, `/threads/${detail.threadId}?format=minimal`);
      const hasReply = (thread.messages || []).some((message) => {
        const messageDate = Number(message.internalDate || 0);
        return (message.labelIds || []).includes("INBOX") && messageDate > sentAtMs;
      });
      if (hasReply) continue;

      items.push({
        id: detail.id,
        threadId: detail.threadId,
        subject: getHeader(detail, "Subject") || "(bez předmětu)",
        to: getHeader(detail, "To") || "",
        sentAt: new Date(sentAtMs).toISOString(),
        daysSinceSent: Math.floor((Date.now() - sentAtMs) / (24 * 60 * 60 * 1000)),
      });
    }

    return NextResponse.json({ connected: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail API selhalo.";
    return NextResponse.json({ connected: true, items: [], error: message }, { status: 502 });
  }
}
