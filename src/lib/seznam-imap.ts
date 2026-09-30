import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
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
