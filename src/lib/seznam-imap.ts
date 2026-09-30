import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { getDb } from "./db";
import { emailAccounts } from "./schema";
import { and, eq } from "drizzle-orm";

const SEZNAM_IMAP_HOST = "imap.seznam.cz";
const SEZNAM_IMAP_PORT = 993;

/** Vyzkouší IMAP přihlášení k seznam.cz (ověření, že údaje fungují, než je uložíme). */
export async function testSeznamImapLogin(email: string, password: string) {
  const client = new ImapFlow({
    host: SEZNAM_IMAP_HOST,
    port: SEZNAM_IMAP_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
  await client.connect();
  await client.logout();
}

export async function getSeznamImapAccount(ownerId: string) {
  const [account] = await getDb()
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.ownerId, ownerId), eq(emailAccounts.provider, "seznam_imap")))
    .limit(1);
  return account || null;
}

export type SeznamMessageBody = { html: string; text: string; subject: string };

export type SeznamMailSummary = {
  id: string;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  snippet: string;
  labels: string[];
};

export type SeznamMailDetail = SeznamMailSummary & {
  body: string;
  attachments: { id: string; filename: string; mimeType: string; size: number }[];
};

const htmlToText = (html: string) =>
  html
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

const firstAddress = (address: AddressObject | AddressObject[] | undefined) => {
  const value = Array.isArray(address) ? address[0]?.value : address?.value;
  return value?.[0];
};

const addressName = (address: { name?: string; address?: string } | undefined, fallback: string) =>
  address?.name?.trim() || address?.address?.trim() || fallback;

const addressEmail = (address: { address?: string } | undefined) => address?.address?.trim() || "";

const buildSnippet = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 220);

async function withSeznamClient<T>(email: string, password: string, callback: (client: ImapFlow) => Promise<T>) {
  const client = new ImapFlow({
    host: SEZNAM_IMAP_HOST,
    port: SEZNAM_IMAP_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.logout();
  }
}

export async function fetchSeznamInboxMessages(email: string, password: string, limit = 30) {
  return withSeznamClient(email, password, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      const uids = await client.search({}, { uid: true });
      const recentUids = (uids || []).slice(-limit).reverse();
      const messages: SeznamMailSummary[] = [];
      for (const uid of recentUids) {
        const message = await client.download(String(uid), undefined, { uid: true });
        if (!message?.content) continue;
        const chunks: Buffer[] = [];
        for await (const chunk of message.content) chunks.push(chunk as Buffer);
        const parsed = await simpleParser(Buffer.concat(chunks));
        const from = firstAddress(parsed.from);
        const to = firstAddress(parsed.to);
        const body = parsed.text || (typeof parsed.html === "string" ? htmlToText(parsed.html) : "");
        messages.push({
          id: String(uid),
          subject: parsed.subject || "(bez předmětu)",
          from: addressName(from, "Neznámý odesílatel"),
          fromEmail: addressEmail(from),
          to: addressName(to, ""),
          date: parsed.date?.toISOString() || "",
          snippet: buildSnippet(body),
          labels: [],
        });
      }
      return {
        connected: true,
        account: email,
        labels: [
          { id: "INBOX", name: "Doručené", messagesTotal: mailbox ? mailbox.exists : messages.length },
        ],
        messages,
      };
    } finally {
      lock.release();
    }
  });
}

export async function fetchSeznamMessage(email: string, password: string, uid: string): Promise<SeznamMailDetail> {
  return withSeznamClient(email, password, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const message = await client.download(uid, undefined, { uid: true });
      if (!message?.content) throw new Error("Zpráva nebyla ve schránce nalezena.");
      const chunks: Buffer[] = [];
      for await (const chunk of message.content) chunks.push(chunk as Buffer);
      const parsed = await simpleParser(Buffer.concat(chunks));
      const from = firstAddress(parsed.from);
      const to = firstAddress(parsed.to);
      const body = parsed.text || (typeof parsed.html === "string" ? htmlToText(parsed.html) : "");
      return {
        id: uid,
        subject: parsed.subject || "(bez předmětu)",
        from: addressName(from, "Neznámý odesílatel"),
        fromEmail: addressEmail(from),
        to: addressName(to, ""),
        date: parsed.date?.toISOString() || "",
        snippet: buildSnippet(body),
        body,
        labels: [],
        attachments: (parsed.attachments || []).map((file, index) => ({
          id: String(index),
          filename: file.filename || `priloha-${index + 1}`,
          mimeType: file.contentType || "application/octet-stream",
          size: file.size || file.content?.length || 0,
        })),
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * Stáhne LinkedIn job-alert e-maily z připojené seznam.cz schránky.
 * `sinceDays` omezuje, jak staré zprávy se vůbec procházejí (IMAP SEARCH SINCE) —
 * bez toho by se na velké schránce (tisíce zpráv) muselo procházet úplně všechno.
 */
export async function fetchLinkedInFromSeznam(email: string, password: string, sinceDays = 30, limit = 40): Promise<SeznamMessageBody[]> {
  const client = new ImapFlow({
    host: SEZNAM_IMAP_HOST,
    port: SEZNAM_IMAP_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
  const bodies: SeznamMessageBody[] = [];
  const since = new Date(Date.now() - Math.max(1, sinceDays) * 24 * 60 * 60 * 1000);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // SEARCH SINCE omezí prohledávání jen na nedávné zprávy — na schránce s tisíci zpráv
      // je to zásadní rozdíl oproti procházení úplně všeho.
      const uids = await client.search({ since, from: "jobalerts-noreply@linkedin.com" }, { uid: true });
      const recentUids = (uids || []).slice(-limit);
      for (const uid of recentUids) {
        const message = await client.download(String(uid), undefined, { uid: true });
        if (!message?.content) continue;
        const chunks: Buffer[] = [];
        for await (const chunk of message.content) chunks.push(chunk as Buffer);
        const parsed = await simpleParser(Buffer.concat(chunks));
        bodies.push({
          html: parsed.html || "",
          text: parsed.text || "",
          subject: parsed.subject || "",
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return bodies;
}
