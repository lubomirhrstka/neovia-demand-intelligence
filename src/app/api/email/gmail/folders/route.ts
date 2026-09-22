import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getFreshGmailAccount, gmailFetch } from "@/lib/gmail";
import { emailAccounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type GmailLabel = {
  id: string;
  name: string;
  messagesTotal?: number;
  messagesUnread?: number;
};

type GmailMessageList = {
  messages?: { id: string; threadId: string }[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: {
    headers?: { name: string; value: string }[];
  };
};

const folderToLabel: Record<string, string> = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  trash: "TRASH",
};
const countedLabels = ["INBOX", "SENT", "DRAFT", "TRASH", "UNREAD", "CATEGORY_PERSONAL"];

const getHeader = (message: GmailMessage, name: string) =>
  message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";

const parseSender = (from: string) => {
  const match = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { name: from || "Neznámý odesílatel", email: from || "" };
  return { name: match[1].replace(/^"|"$/g, "").trim() || match[2], email: match[2] };
};

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") || "inbox";
  const account = await getFreshGmailAccount(session.user.id);
  if (!account?.accessToken) {
    return NextResponse.json({ connected: false, labels: [], messages: [] });
  }

  try {
    const labelsResponse = await gmailFetch<{ labels?: GmailLabel[] }>(account.accessToken, "/labels");
    const labelDetails = await Promise.all(
      countedLabels.map(async (id) => {
        try {
          return await gmailFetch<GmailLabel>(account.accessToken!, `/labels/${encodeURIComponent(id)}`);
        } catch {
          return null;
        }
      }),
    );
    const labels = [
      ...(labelsResponse.labels || []),
      ...labelDetails.filter((label): label is GmailLabel => Boolean(label)),
    ].reduce<GmailLabel[]>((acc, label) => {
      const existing = acc.findIndex((item) => item.id === label.id);
      if (existing >= 0) acc[existing] = { ...acc[existing], ...label };
      else acc.push(label);
      return acc;
    }, []);
    const labelId = folderToLabel[folder];
    const listPath = labelId
      ? `/messages?maxResults=20&labelIds=${encodeURIComponent(labelId)}`
      : "/messages?maxResults=20";
    const list = await gmailFetch<GmailMessageList>(account.accessToken, listPath);
    const messages = await Promise.all(
      (list.messages || []).slice(0, 20).map(async (item) => {
        const detail = await gmailFetch<GmailMessage>(
          account.accessToken!,
          `/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        );
        const sender = parseSender(getHeader(detail, "From"));
        return {
          id: detail.id,
          threadId: detail.threadId,
          subject: getHeader(detail, "Subject") || "(bez předmětu)",
          from: sender.name,
          fromEmail: sender.email,
          to: getHeader(detail, "To"),
          date: getHeader(detail, "Date"),
          snippet: detail.snippet || "",
          labels: detail.labelIds || [],
        };
      }),
    );

    await getDb().update(emailAccounts).set({ lastSyncAt: new Date(), updatedAt: new Date() }).where(eq(emailAccounts.id, account.id));

    return NextResponse.json({
      connected: true,
      account: account.email,
      labels,
      messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail API selhalo.";
    return NextResponse.json({ connected: true, account: account.email, labels: [], messages: [], error: message }, { status: 502 });
  }
}
