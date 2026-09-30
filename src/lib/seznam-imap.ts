import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import { getDb } from "./db";
import { emailAccounts } from "./schema";
import { and, eq } from "drizzle-orm";

const SEZNAM_IMAP_HOST = "imap.seznam.cz";
const SEZNAM_IMAP_PORT = 993;
const SEZNAM_SMTP_HOST = "smtp.seznam.cz";
const SEZNAM_SMTP_PORT = 465;

/** App folder id → candidate IMAP mailbox names (Seznam CZ / EN). */
export const SEZNAM_FOLDER_CANDIDATES: Record<string, string[]> = {
  inbox: ["INBOX"],
  sent: ["Odeslané", "Sent", "Sent Messages", "Sent Items"],
  drafts: ["Rozpracované", "Drafts", "Draft"],
  trash: ["Koš", "Trash", "Deleted Messages", "Deleted Items"],
  spam: ["Spam", "Junk", "Junk E-mail"],
};

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
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
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

export function encodeSeznamMessageId(mailbox: string, uid: string | number) {
  return `${mailbox}:${uid}`;
}

export function decodeSeznamMessageId(id: string): { mailbox: string; uid: string } {
  const idx = id.indexOf(":");
  if (idx <= 0) return { mailbox: "INBOX", uid: id };
  return { mailbox: id.slice(0, idx), uid: id.slice(idx + 1) };
}

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
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

async function listMailboxPaths(client: ImapFlow): Promise<string[]> {
  const boxes = await client.list();
  return boxes.map((b) => b.path);
}

export async function resolveSeznamMailbox(client: ImapFlow, folder: string): Promise<string | null> {
  const candidates = SEZNAM_FOLDER_CANDIDATES[folder] || [folder];
  const paths = await listMailboxPaths(client);
  const lower = new Map(paths.map((p) => [p.toLowerCase(), p]));
  for (const name of candidates) {
    if (lower.has(name.toLowerCase())) return lower.get(name.toLowerCase())!;
  }
  for (const name of candidates) {
    const found = paths.find((p) => p.toLowerCase().includes(name.toLowerCase()));
    if (found) return found;
  }
  if (folder === "inbox") return "INBOX";
  return null;
}

async function parseSummary(
  mailbox: string,
  uid: string | number,
  raw: Buffer,
  flags?: string[],
): Promise<SeznamMailSummary> {
  const parsed = await simpleParser(raw);
  const from = firstAddress(parsed.from);
  const to = firstAddress(parsed.to);
  const body = parsed.text || (typeof parsed.html === "string" ? htmlToText(parsed.html) : "");
  const labels: string[] = [];
  if (flags && !flags.some((f) => /\\seen/i.test(f) || f.toLowerCase() === "\\seen")) {
    labels.push("UNREAD");
  }
  return {
    id: encodeSeznamMessageId(mailbox, uid),
    subject: parsed.subject || "(bez předmětu)",
    from: addressName(from, "Neznámý odesílatel"),
    fromEmail: addressEmail(from),
    to: addressName(to, ""),
    date: parsed.date?.toISOString() || "",
    snippet: buildSnippet(body),
    labels,
  };
}

export async function fetchSeznamFolderMessages(email: string, password: string, folder = "inbox", limit = 30) {
  return withSeznamClient(email, password, async (client) => {
    const paths = await listMailboxPaths(client);
    const labels = [];
    for (const [appFolder] of Object.entries(SEZNAM_FOLDER_CANDIDATES)) {
      const mailbox = await resolveSeznamMailbox(client, appFolder);
      if (!mailbox) continue;
      let messagesTotal = 0;
      try {
        const status = await client.status(mailbox, { messages: true });
        messagesTotal = status.messages || 0;
      } catch {
        messagesTotal = 0;
      }
      const displayName =
        appFolder === "inbox"
          ? "Doručené"
          : appFolder === "sent"
            ? "Odeslané"
            : appFolder === "drafts"
              ? "Koncepty"
              : appFolder === "trash"
                ? "Koš"
                : appFolder === "spam"
                  ? "Spam"
                  : mailbox;
      labels.push({ id: appFolder, name: displayName, messagesTotal, mailbox });
    }

    const mailbox = await resolveSeznamMailbox(client, folder);
    if (!mailbox) {
      return {
        connected: true,
        account: email,
        labels,
        messages: [],
        info: `Složka „${folder}“ na Seznamu nebyla nalezena.`,
        availableMailboxes: paths,
      };
    }

    const lock = await client.getMailboxLock(mailbox);
    try {
      const uids = await client.search({}, { uid: true });
      const recentUids = (uids || []).slice(-limit).reverse();
      const messages: SeznamMailSummary[] = [];
      for (const uid of recentUids) {
        try {
          const downloaded = await client.download(String(uid), undefined, { uid: true });
          if (!downloaded?.content) continue;
          const chunks: Buffer[] = [];
          for await (const chunk of downloaded.content) chunks.push(chunk as Buffer);
          let flags: string[] = [];
          try {
            const fetched = await client.fetchOne(String(uid), { flags: true }, { uid: true });
            if (fetched?.flags) flags = Array.from(fetched.flags);
          } catch {
            /* ignore */
          }
          messages.push(await parseSummary(mailbox, uid, Buffer.concat(chunks), flags));
        } catch {
          /* skip broken message */
        }
      }
      return {
        connected: true,
        account: email,
        labels,
        messages,
        mailbox,
      };
    } finally {
      lock.release();
    }
  });
}

/** @deprecated use fetchSeznamFolderMessages */
export async function fetchSeznamInboxMessages(email: string, password: string, limit = 30) {
  return fetchSeznamFolderMessages(email, password, "inbox", limit);
}

export async function fetchSeznamMessage(email: string, password: string, id: string): Promise<SeznamMailDetail> {
  const { mailbox, uid } = decodeSeznamMessageId(id);
  return withSeznamClient(email, password, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const message = await client.download(uid, undefined, { uid: true });
      if (!message?.content) throw new Error("Zpráva nebyla ve schránce nalezena.");
      const chunks: Buffer[] = [];
      for await (const chunk of message.content) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks);
      const summary = await parseSummary(mailbox, uid, raw);
      const parsed = await simpleParser(raw);
      const body = parsed.text || (typeof parsed.html === "string" ? htmlToText(parsed.html) : "");
      return {
        ...summary,
        body,
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

export async function fetchSeznamAttachment(
  email: string,
  password: string,
  messageId: string,
  attachmentId: string,
): Promise<{ filename: string; mimeType: string; content: Buffer }> {
  const { mailbox, uid } = decodeSeznamMessageId(messageId);
  const index = Number(attachmentId);
  if (Number.isNaN(index) || index < 0) throw new Error("Neplatné id přílohy.");

  return withSeznamClient(email, password, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const message = await client.download(uid, undefined, { uid: true });
      if (!message?.content) throw new Error("Zpráva nebyla nalezena.");
      const chunks: Buffer[] = [];
      for await (const chunk of message.content) chunks.push(chunk as Buffer);
      const parsed = await simpleParser(Buffer.concat(chunks));
      const file = (parsed.attachments || [])[index];
      if (!file) throw new Error("Příloha nebyla nalezena.");
      return {
        filename: file.filename || `priloha-${index + 1}`,
        mimeType: file.contentType || "application/octet-stream",
        content: Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content || []),
      };
    } finally {
      lock.release();
    }
  });
}

/** Přesun do Koše, nebo trvalé smazání pokud už jsou v koši. */
export async function deleteSeznamMessages(
  email: string,
  password: string,
  ids: string[],
  options?: { permanent?: boolean },
) {
  if (!ids.length) return { count: 0 };

  return withSeznamClient(email, password, async (client) => {
    const trashMailbox = (await resolveSeznamMailbox(client, "trash")) || "Trash";
    const byMailbox = new Map<string, string[]>();
    for (const id of ids) {
      const { mailbox, uid } = decodeSeznamMessageId(id);
      const list = byMailbox.get(mailbox) || [];
      list.push(uid);
      byMailbox.set(mailbox, list);
    }

    let count = 0;
    for (const [mailbox, uids] of byMailbox) {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const permanent = options?.permanent || mailbox.toLowerCase() === trashMailbox.toLowerCase();
        if (permanent) {
          await client.messageDelete(uids, { uid: true });
        } else {
          try {
            await client.messageMove(uids, trashMailbox, { uid: true });
          } catch {
            await client.messageFlagsAdd(uids, ["\\Deleted"], { uid: true });
            await client.messageDelete(uids, { uid: true });
          }
        }
        count += uids.length;
      } finally {
        lock.release();
      }
    }
    return { count };
  });
}

export async function sendSeznamEmail(
  email: string,
  password: string,
  payload: {
    to: string;
    subject: string;
    body: string;
    attachments?: { name: string; type: string; data: string }[];
  },
) {
  const transporter = nodemailer.createTransport({
    host: SEZNAM_SMTP_HOST,
    port: SEZNAM_SMTP_PORT,
    secure: true,
    auth: { user: email, pass: password },
  });

  const attachments = (payload.attachments || []).slice(0, 5).map((file) => {
    const base64 = file.data.includes(",") ? file.data.split(",")[1] : file.data;
    return {
      filename: file.name || "priloha",
      content: Buffer.from(base64 || "", "base64"),
      contentType: file.type || "application/octet-stream",
    };
  });

  const info = await transporter.sendMail({
    from: email,
    to: payload.to,
    subject: payload.subject,
    text: payload.body,
    attachments,
  });

  return { messageId: info.messageId, accepted: info.accepted };
}

export async function fetchLinkedInFromSeznam(
  email: string,
  password: string,
  sinceDays = 30,
  limit = 40,
): Promise<SeznamMessageBody[]> {
  return withSeznamClient(email, password, async (client) => {
    const bodies: SeznamMessageBody[] = [];
    const since = new Date(Date.now() - Math.max(1, sinceDays) * 24 * 60 * 60 * 1000);
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ since, from: "jobalerts-noreply@linkedin.com" }, { uid: true });
      const recentUids = (uids || []).slice(-limit);
      for (const uid of recentUids) {
        const message = await client.download(String(uid), undefined, { uid: true });
        if (!message?.content) continue;
        const chunks: Buffer[] = [];
        for await (const chunk of message.content) chunks.push(chunk as Buffer);
        const parsed = await simpleParser(Buffer.concat(chunks));
        bodies.push({
          html: typeof parsed.html === "string" ? parsed.html : "",
          text: parsed.text || "",
          subject: parsed.subject || "",
        });
      }
    } finally {
      lock.release();
    }
    return bodies;
  });
}
