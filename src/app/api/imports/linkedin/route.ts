import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sameCompanyIdentity } from "@/lib/matching";
import { getFreshGmailAccount, gmailFetch } from "@/lib/gmail";
import { companies, connectorSources, demands, importRuns, monitorSettings } from "@/lib/schema";
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
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
};
type GmailMessageList = { messages?: { id: string }[] };

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
    const company = (dotSplit[0] || "").trim().slice(0, 180) || "Firma neuvedena";
    const location = (dotSplit[1] || "").split(/\s{2,}|Snadná žádost|spojení/)[0].trim().slice(0, 180);
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
const relevanceFor = (text: string, keywords: string[]) => {
  const lower = text.toLowerCase();
  const matches = keywords.filter((k) => k && lower.includes(k.toLowerCase())).length;
  return Math.min(100, Math.max(20, matches * 15));
};

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const db = getDb();
  const account = await getFreshGmailAccount(session.user.id);
  if (!account?.accessToken) {
    return NextResponse.json({ error: "Gmail není připojený. Připojte ho v Nastavení." }, { status: 409 });
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

  let found = 0, created = 0, updated = 0, skipped = 0;
  const warnings: string[] = [];

  try {
    const list = await gmailFetch<GmailMessageList>(
      account.accessToken,
      "/messages?maxResults=15&q=" + encodeURIComponent("from:jobalerts-noreply@linkedin.com"),
    );
    const allCompanies = await db.select().from(companies).where(eq(companies.ownerId, session.user.id));

    for (const item of list.messages || []) {
      const message = await gmailFetch<GmailMessage>(account.accessToken, `/messages/${item.id}?format=full`);
      const html = htmlFromPart(message.payload);
      if (!html) continue;
      const jobs = parseLinkedInJobs(html);
      found += jobs.length;

      for (const job of jobs) {
        const externalId = `linkedin:${job.externalId}`;
        const [existingDemand] = await db.select({ id: demands.id }).from(demands).where(and(eq(demands.ownerId, session.user.id), eq(demands.externalId, externalId))).limit(1);
        if (existingDemand) {
          skipped += 1;
          continue;
        }

        const companyName = normalizeCompanyNameSafe(job.company);
        let companyRecord = allCompanies.find((c) => sameCompanyIdentity(c, { name: companyName }).same);
        if (!companyRecord) {
          const [createdCompany] = await db.insert(companies).values({
            name: companyName,
            source: "LinkedIn",
            ownerId: session.user.id,
          }).returning();
          companyRecord = createdCompany;
          allCompanies.push(createdCompany);
        }

        await db.insert(demands).values({
          externalId,
          title: job.title,
          source: "LinkedIn",
          sourceUrl: job.url,
          role: job.title,
          location: job.location || null,
          demandText: `${job.title} — ${companyName}${job.location ? ` · ${job.location}` : ""}`,
          relevanceScore: relevanceFor(`${job.title} ${job.location}`, keywords),
          companyId: companyRecord.id,
          ownerId: session.user.id,
        });
        created += 1;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "LinkedIn import selhal.";
    warnings.push(message);
  }

  await db.update(importRuns).set({
    status: warnings.length ? "completed_with_warnings" : "completed",
    completedAt: new Date(),
    receivedCount: found,
    createdCount: created,
    updatedCount: updated,
    skippedCount: skipped,
    errorSummary: warnings.length ? JSON.stringify({ warnings }) : null,
  }).where(eq(importRuns.id, run.id));

  return NextResponse.json({ found, created, updated, skipped, warnings });
}

export const GET = POST;

function normalizeCompanyNameSafe(raw: string) {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed.length < 2) return "Firma neuvedena (LinkedIn)";
  return trimmed;
}
