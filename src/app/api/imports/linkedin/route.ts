import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sameCompanyIdentity } from "@/lib/matching";
import { getFreshGmailAccount, gmailFetch } from "@/lib/gmail";
import { fetchLinkedInFromSeznam, getSeznamImapAccount } from "@/lib/seznam-imap";
import { verifyCompanyWeb } from "@/lib/company-web-verify";
import { companies, connectorSources, demands, importRuns, monitorSettings, emailAccounts } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
};
type GmailMessageList = { messages?: { id: string }[] };

const getHeader = (message: GmailMessage, name: string) =>
  message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";

const decodeBody = (data?: string) => {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
};

/** Vrátí RAW html část zprávy (na rozdíl od textFromPart v jiných endpointech, tady html tagy nestrháváme — potřebujeme je pro parsování). */
const htmlFromPart = (part?: GmailPart): string => {
  if (!part) return "";
  if (part.mimeType === "text/html" && part.body?.data) return decodeBody(part.body.data);
  for (const child of part.parts || []) {
    const html = htmlFromPart(child);
    if (html) return html;
  }
  return "";
};

const textFromPart = (part?: GmailPart): string => {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBody(part.body.data);
  if (part.mimeType === "text/html" && part.body?.data) {
    return stripTags(decodeBody(part.body.data)).replace(/\s{2,}/g, " ").trim();
  }
  for (const child of part.parts || []) {
    const text = textFromPart(child);
    if (text) return text;
  }
  return "";
};

const stripTags = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

type ParsedJob = {
  externalId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  detail?: string;
};

/** Heuristický parser LinkedIn job-alert e-mailu: najde odkazy na /jobs/view/<id> a k nim dohledá firmu + lokalitu v následujícím textu. */
function parseLinkedInJobs(html: string): ParsedJob[] {
  const linkPattern = /<a[^>]+href="([^"]*linkedin\.com\/[^"]*\/jobs\/view\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const matches: { href: string; id: string; title: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html))) {
    const title = stripTags(match[3]);
    if (title.length < 3) continue;
    matches.push({ href: match[1].replace(/&amp;/g, "&"), id: match[2], title, index: match.index });
  }
  const jobs: ParsedJob[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    if (seenIds.has(current.id)) continue;
    seenIds.add(current.id);
    const windowEnd = i + 1 < matches.length ? matches[i + 1].index : Math.min(html.length, current.index + 1600);
    const chunk = stripTags(html.slice(current.index, windowEnd));
    // typický vzor: "Název pozice Firma · Lokalita (Typ)"
    const afterTitle = chunk.slice(current.title.length).trim();
    const dotSplit = afterTitle.split("·");
    const company = sanitizeCompany((dotSplit[0] || "").trim().slice(0, 180)) || "Firma neuvedena";
    const location = sanitizeLocation((dotSplit[1] || "").split(/\s{2,}|Snadná žádost|spojení/)[0].trim().slice(0, 180));
    // pokud firma vyšla jako URL fragment, celý záznam je nespolehlivý — raději ho přeskočit
    // než uložit poptávku s nesmyslnými daty (uživatel to nemůže rozumně ověřit).
    if (looksLikeUrlJunk(dotSplit[0] || "")) continue;
    jobs.push({
      externalId: current.id,
      title: current.title,
      company,
      location,
      url: current.href,
    });
  }
  return jobs;
}

const cleanLinkedInTitle = (value: string) =>
  value
    .replace(/^fwd:\s*/i, "")
    .replace(/^re:\s*/i, "")
    .replace(/^příležitost na pozici\s+/i, "")
    .replace(/^upozornění na nové pracovní příležitosti?\s*/i, "")
    .trim();

/** Ochrana proti rozbitému parsování: rozpozná, když se místo firmy/lokality omylem
 *  vytáhl fragment trackovací URL (typicky "view/123.../?trackingId=..." apod.). */
const looksLikeUrlJunk = (value: string) => {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  if (/^https?:|trackingid=|refid=|%2[a-f0-9]|\/(view|jobs|comm)\//i.test(v)) return true;
  // dlouhý řetězec bez mezer s lomítky/otazníkem vypadá jako URL fragment, ne jako název firmy
  if (v.length > 30 && !v.includes(" ") && /[/?=&]/.test(v)) return true;
  return false;
};
const sanitizeCompany = (value: string) => (looksLikeUrlJunk(value) ? "" : value);
const sanitizeLocation = (value: string) => (looksLikeUrlJunk(value) ? "" : value);

const stableTextId = (messageId: string, title: string, company: string, index: number) =>
  `${messageId}:${index}:${Buffer.from(`${title}|${company}`.toLowerCase()).toString("base64url").slice(0, 48)}`;

function parseLinkedInJobsFromText(text: string, messageId: string, subject = ""): ParsedJob[] {
  const normalized = text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const jobs: ParsedJob[] = [];
  const seen = new Set<string>();

  const add = (titleRaw: string, companyRaw: string, locationRaw = "", detail = "") => {
    const title = cleanLinkedInTitle(titleRaw)
      .replace(/\s+a\s+\d+\s+dalších.*$/i, "")
      .replace(/\s+ve společnosti\s+.*$/i, "")
      .trim();
    const company = companyRaw
      .replace(/\s+a\s+\d+\s+dalších.*$/i, "")
      .replace(/[.,;:]+$/g, "")
      .trim();
    if (!title || title.length < 3 || !company || company.length < 2) return;
    if (looksLikeUrlJunk(company)) return;
    const key = `${title.toLowerCase()}|${company.toLowerCase()}|${locationRaw.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push({
      externalId: stableTextId(messageId, title, company, jobs.length),
      title: title.slice(0, 220),
      company: company.slice(0, 180),
      location: locationRaw.trim().slice(0, 180),
      url: "",
      detail: detail || normalized.slice(0, 1200),
    });
  };

  const subjectMatch = subject.match(/(?:pozici|pozice)\s+(.+?)\s+ve společnosti\s+(.+?)(?:\s+a\s+\d+\s+dalších|,\s+které|$)/i);
  if (subjectMatch) add(subjectMatch[1], subjectMatch[2], "", normalized.slice(0, 1200));

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(od|komu|datum|předmět|-----|linkedin|snadná žádost|1 spojení)$/i.test(line));

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const colonMatch = line.match(/^(.{2,120}?):\s*(.{3,220})(?:\s+[–-]\s+(.{2,160}))?$/);
    if (colonMatch) {
      const company = colonMatch[1].trim();
      const title = colonMatch[2].trim();
      if (!/^(od|komu|datum|předmět)$/i.test(company) && !company.includes("@")) {
        add(title, company, colonMatch[3] || "", lines.slice(Math.max(0, i - 2), i + 4).join("\n"));
      }
      continue;
    }

    const dotLine = lines[i + 1] || "";
    if (dotLine.includes("·") && line.length > 3 && line.length < 180) {
      const [company, ...locationParts] = dotLine.split("·").map((part) => part.trim());
      add(line, company, locationParts.join(" · "), lines.slice(i, i + 3).join("\n"));
      i += 1;
    }
  }

  return jobs;
}

async function listLinkedInCandidateMessages(accessToken: string, sinceDays = 30) {
  const queries = [
    `from:jobalerts-noreply@linkedin.com newer_than:${sinceDays}d`,
    `"jobalerts-noreply@linkedin.com" newer_than:${sinceDays}d`,
    `"Příležitost na pozici" "LinkedIn" newer_than:${sinceDays}d`,
    `"pracovní příležitosti LinkedIn" newer_than:${sinceDays}d`,
  ];
  const unique = new Map<string, { id: string }>();
  for (const query of queries) {
    const list = await gmailFetch<GmailMessageList>(
      accessToken,
      "/messages?maxResults=30&q=" + encodeURIComponent(query),
    );
    for (const message of list.messages || []) unique.set(message.id, message);
  }
  return [...unique.values()].slice(0, 40);
}

const relevanceFor = (text: string, keywords: string[]) => {
  const lower = text.toLowerCase();
  const matches = keywords.filter((k) => k && lower.includes(k.toLowerCase())).length;
  return Math.min(100, Math.max(20, matches * 15));
};

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const db = getDb();
  const body = await request.json().catch(() => ({}));
  const sinceDays = Math.min(365, Math.max(1, Number(body.sinceDays) || 30));
  const account = await getFreshGmailAccount(session.user.id);
  const seznamAccount = await getSeznamImapAccount(session.user.id);
  if (!account?.accessToken && !seznamAccount) {
    return NextResponse.json({ error: "Není připojený žádný e-mail (Gmail ani seznam.cz). Připojte alespoň jeden v Nastavení." }, { status: 409 });
  }

  const [existingSource] = await db.select().from(connectorSources).where(eq(connectorSources.key, "linkedin")).limit(1);
  const source =
    existingSource ||
    (
      await db.insert(connectorSources).values({
        key: "linkedin",
        name: "LinkedIn, e-mailové alerty",
        kind: "email",
        status: "active",
        createdById: session.user.id,
      }).returning()
    )[0];
  const [run] = await db.insert(importRuns).values({
    sourceId: source.id,
    status: "queued",
    startedAt: new Date(),
    triggeredById: session.user.id,
  }).returning();

  const [settings] = await db.select().from(monitorSettings).where(eq(monitorSettings.ownerId, session.user.id)).orderBy(desc(monitorSettings.updatedAt)).limit(1);
  const keywords = settings?.keywords?.length ? settings.keywords : ["IT Security", "Cybersecurity", "Security Officer", "NIS2", "GDPR", "Incident Response", "SOC Manager"];

  let found = 0, created = 0, updated = 0, skipped = 0, webVerified = 0;
  const warnings: string[] = [];
  const allCompanies = await db.select().from(companies).where(eq(companies.ownerId, session.user.id));
  const MAX_AUTO_VERIFY = 6; // rozpočet na import — ověření webu stojí několik requestů, nechceme import protáhnout na minuty

  const saveJob = async (job: ParsedJob) => {
    found += 1;
    const externalId = `linkedin:${job.externalId}`;
    const [existingDemand] = await db.select({ id: demands.id }).from(demands).where(and(eq(demands.ownerId, session.user.id), eq(demands.externalId, externalId))).limit(1);
    if (existingDemand) {
      skipped += 1;
      return;
    }
    const companyName = normalizeCompanyNameSafe(job.company);
    let companyRecord = allCompanies.find((c) => sameCompanyIdentity(c, { name: companyName }).same);
    let isNewCompany = false;
    if (!companyRecord) {
      const [createdCompany] = await db.insert(companies).values({
        name: companyName,
        source: "LinkedIn",
        ownerId: session.user.id,
      }).returning();
      companyRecord = createdCompany;
      allCompanies.push(createdCompany);
      isNewCompany = true;
    }
    await db.insert(demands).values({
      externalId,
      title: job.title,
      source: "LinkedIn",
      sourceUrl: job.url || null,
      role: job.title,
      location: job.location || null,
      demandText: job.detail || `${job.title} — ${companyName}${job.location ? ` · ${job.location}` : ""}`,
      relevanceScore: relevanceFor(`${job.title} ${job.location} ${job.detail || ""}`, keywords),
      companyId: companyRecord.id,
      ownerId: session.user.id,
    });
    created += 1;

    // Automatické ověření firemního webu — jen pro nové, dosud neznámé firmy a jen do rozpočtu
    // MAX_AUTO_VERIFY na jeden import (stejná logika jako ruční tlačítko "Ověřit web a kontakty").
    if (isNewCompany && companyName !== "Firma neuvedena (LinkedIn)" && webVerified < MAX_AUTO_VERIFY) {
      webVerified += 1;
      try {
        await verifyCompanyWeb({
          ownerId: session.user.id,
          companyId: companyRecord.id,
          companyName,
          companyWebsite: companyRecord.website,
          companyNote: companyRecord.note,
          demandTitle: job.title,
          demandText: job.detail || null,
          demandSourceUrl: job.url || null,
          maxUrls: 6,
          timeoutMs: 4000,
        });
      } catch {
        // ověření je "best effort" — nikdy nesmí shodit import
      }
    }
  };

  if (account?.accessToken) {
    try {
      const messages = await listLinkedInCandidateMessages(account.accessToken, sinceDays);
      for (const item of messages) {
        const message = await gmailFetch<GmailMessage>(account.accessToken, `/messages/${item.id}?format=full`);
        const subject = getHeader(message, "Subject");
        const html = htmlFromPart(message.payload);
        const text = textFromPart(message.payload) || message.snippet || "";
        if (!html && !text && !subject) continue;
        const jobs = [
          ...parseLinkedInJobs(html),
          ...parseLinkedInJobsFromText(`${subject}\n${text}`, message.id, subject),
        ].filter((job, index, all) =>
          all.findIndex((candidate) =>
            candidate.externalId === job.externalId ||
            (`${candidate.title}|${candidate.company}`.toLowerCase() === `${job.title}|${job.company}`.toLowerCase())
          ) === index,
        );
        for (const job of jobs) await saveJob(job);
      }
      if (!messages.length) warnings.push(`V Gmailu nebyly nalezeny LinkedIn alerty ani přeposlané zprávy za posledních ${sinceDays} dní.`);
    } catch (error) {
      warnings.push(`Gmail: ${error instanceof Error ? error.message : "LinkedIn import selhal."}`);
    }
  }

  if (seznamAccount?.accessToken) {
    try {
      const seznamMessages = await fetchLinkedInFromSeznam(seznamAccount.email, seznamAccount.accessToken, sinceDays);
      for (const message of seznamMessages) {
        const jobs = [
          ...parseLinkedInJobs(message.html),
          ...parseLinkedInJobsFromText(`${message.subject}\n${message.text}`, `seznam:${message.subject}:${message.text.slice(0, 40)}`, message.subject),
        ].filter((job, index, all) =>
          all.findIndex((candidate) =>
            candidate.externalId === job.externalId ||
            (`${candidate.title}|${candidate.company}`.toLowerCase() === `${job.title}|${job.company}`.toLowerCase())
          ) === index,
        );
        for (const job of jobs) await saveJob(job);
      }
      await db.update(emailAccounts).set({ lastSyncAt: new Date() }).where(eq(emailAccounts.id, seznamAccount.id));
      if (!seznamMessages.length) warnings.push(`Na seznam.cz nebyly nalezeny LinkedIn alerty za posledních ${sinceDays} dní.`);
    } catch (error) {
      warnings.push(`seznam.cz: ${error instanceof Error ? error.message : "IMAP import selhal."}`);
    }
  }

  if (found === 0 && !warnings.length) warnings.push("LinkedIn e-maily byly nalezeny, ale nepodařilo se z nich vytěžit žádnou pozici.");

  await db.update(importRuns).set({
    status: warnings.length ? "completed_with_warnings" : "completed",
    completedAt: new Date(),
    receivedCount: found,
    createdCount: created,
    updatedCount: updated,
    skippedCount: skipped,
    errorSummary: warnings.length ? JSON.stringify({ warnings }) : null,
  }).where(eq(importRuns.id, run.id));

  return NextResponse.json({ found, created, updated, skipped, webVerified, warnings });
}

export const GET = POST;

function normalizeCompanyNameSafe(raw: string) {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed.length < 2) return "Firma neuvedena (LinkedIn)";
  return trimmed;
}
