import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  companies,
  connectorSources,
  demands,
  importRuns,
  monitorSettings,
} from "@/lib/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const sources = [
  { name: "Jobs.cz", url: "https://www.jobs.cz/prace/?keywords=IT+Security" },
  {
    name: "Prace.cz",
    url: "https://www.prace.cz/nabidky/it-security-specialist/",
  },
];
const decode = (s: string) => s.replace(/\\u0026/g, "&").replace(/\\"/g, '"');
const decodeHtml = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
const TAG_KEYWORDS = [
  "IT Security",
  "Cybersecurity",
  "Security",
  "SOC",
  "NIS2",
  "GDPR",
  "DORA",
  "ISO 27001",
  "SIEM",
  "Cloud",
  "Azure",
  "AWS",
  "Linux",
  "DevOps",
  "Java",
  ".NET",
  "Python",
  "SQL",
  "Data",
  "QA",
  "Tester",
  "Analyst",
  "B2B",
  "Hybrid",
  "Remote",
];
const extractTags = (text: string) =>
  TAG_KEYWORDS.filter((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase()),
  ).slice(0, 12);
const unavailableDetailText =
  "Detail inzerátu nebyl ve výpisu dostupný. Otevřete původní zdroj a zkontrolujte plné znění.";
function detailUrlFor(sourceHtml: string, itemId: string) {
  const escaped = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const link = sourceHtml.match(
    new RegExp(`href="([^"]*(?:/pd/${escaped}|id=${escaped})[^"]*)"`, "i"),
  )?.[1];
  return link ? decodeHtml(link) : null;
}
function textFromHtml(html: string) {
  const meta =
    html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ||
    html.match(/<meta property="og:description" content="([^"]*)"/i)?.[1];
  if (meta) return normalize(decodeHtml(meta));
  const stripped = normalize(
    decodeHtml(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
  return stripped.length > 300 ? stripped.slice(0, 4000) : null;
}
async function fetchDemandDetail(url: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "NEOVIA Demand Intelligence/1.0" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    return textFromHtml(html);
  } catch {
    return null;
  }
}
function partMatches(part: string, value: number) {
  return (
    part === "*" ||
    part
      .split(",")
      .some((token) =>
        token.includes("-")
          ? value >= Number(token.split("-")[0]) &&
            value <= Number(token.split("-")[1])
          : Number(token) === value,
      )
  );
}
function scheduleDue(value: string, now: Date) {
  const legacy =
    value === "Po–Pá 08:30"
      ? "30 6 * * 1-5"
      : value === "Út, Čt 15:00"
        ? "0 13 * * 2,4"
        : value;
  const [minute, hour, , , weekday] = legacy.trim().split(/\s+/);
  return (
    Boolean(minute && hour && weekday) &&
    partMatches(minute, now.getUTCMinutes()) &&
    partMatches(hour, now.getUTCHours()) &&
    partMatches(weekday, now.getUTCDay())
  );
}
export async function POST() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const cronAllowed =
    Boolean(process.env.CRON_SECRET) &&
    requestHeaders.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const db = getDb();
  let ownerId = session?.user.id;
  if (!ownerId && cronAllowed) {
    const [first] = await db
      .select({ ownerId: monitorSettings.ownerId })
      .from(monitorSettings)
      .orderBy(desc(monitorSettings.updatedAt))
      .limit(1);
    ownerId = first?.ownerId;
  }
  if (!ownerId)
    return NextResponse.json(
      { error: "Nepřihlášený uživatel" },
      { status: 401 },
    );
  const [settings] = await db
    .select()
    .from(monitorSettings)
    .where(eq(monitorSettings.ownerId, ownerId))
    .limit(1);
  if (
    cronAllowed &&
    requestHeaders.get("x-vercel-cron-schedule") &&
    !(settings?.schedules || []).some(
      (schedule) => schedule.enabled && scheduleDue(schedule.cron, new Date()),
    )
  ) {
    return NextResponse.json({ skipped: true, reason: "Mimo uložený harmonogram" });
  }
  const keywords = (
    settings?.keywords || [
      "IT Security",
      "Cybersecurity",
      "NIS2",
      "GDPR",
      "SOC Manager",
    ]
  ).map((x) => x.toLowerCase());
  const excluded = (settings?.excludedKeywords || []).map((x) =>
    x.toLowerCase(),
  );
  let found = 0,
    created = 0,
    updated = 0,
    skipped = 0,
    parsed = 0;
  const [sourceRecord] = await db
    .select()
    .from(connectorSources)
    .where(eq(connectorSources.key, "job-monitor"))
    .limit(1);
  const connector =
    sourceRecord ||
    (
      await db
        .insert(connectorSources)
        .values({
          key: "job-monitor",
          name: "Job Monitor, pracovní portály",
          kind: "scraper",
          status: "active",
          termsUrl: "https://www.jobs.cz/",
          refreshMinutes: 1440,
          createdById: ownerId,
        })
        .returning()
    )[0];
  const [run] = await db
    .insert(importRuns)
    .values({
      sourceId: connector.id,
      status: "running",
      startedAt: new Date(),
      triggeredById: ownerId,
    })
    .returning();
  const warnings: string[] = [];
  for (const source of sources) {
    let html = "";
    try {
      const response = await fetch(source.url, {
        headers: { "User-Agent": "NEOVIA Demand Intelligence/1.0" },
        cache: "no-store",
      });
      if (!response.ok) {
        warnings.push(`${source.name}: zdroj vrátil stav ${response.status}.`);
        skipped++;
        continue;
      }
      html = await response.text();
    } catch (error) {
      warnings.push(
        `${source.name}: stránku se nepodařilo stáhnout, ${
          error instanceof Error ? error.message : "neznámá chyba"
        }.`,
      );
      skipped++;
      continue;
    }
    const matches = [
      ...html.matchAll(
        /\\"item_id\\":\\"([^\\"]+)\\"[\s\S]{0,700}?\\"item_name\\":\\"([^\\"]+)\\"[\s\S]{0,700}?\\"item_brand\\":\\"([^\\"]*)\\"/g,
      ),
    ];
    parsed += matches.length;
    if (!matches.length) warnings.push(`${source.name}: stránka neobsahovala čitelný seznam inzerátů.`);
    for (const m of matches.slice(0, 60)) {
      const title = normalize(decode(m[2]));
      const companyName =
        normalize(decode(m[3]).replace(/\s+\d+$/, "")) || "Neznámá firma";
      const text = `${title} ${companyName}`.toLowerCase();
      if (
        !keywords.some((k) => text.includes(k)) ||
        excluded.some((k) => text.includes(k))
      ) {
        skipped++;
        continue;
      }
      found++;
      const externalId = `${source.name}:${m[1]}`;
      const detailUrl = detailUrlFor(html, m[1]);
      const demandText =
        (await fetchDemandDetail(detailUrl)) || unavailableDetailText;
      if (!detailUrl)
        warnings.push(`${source.name}: u inzerátu ${title} nebyl nalezen odkaz na detail.`);
      if (demandText === unavailableDetailText)
        warnings.push(`${source.name}: u inzerátu ${title} se nepodařilo vytěžit plné znění.`);
      const [known] = await db
        .select()
        .from(companies)
        .where(
          and(eq(companies.ownerId, ownerId), eq(companies.name, companyName)),
        )
        .limit(1);
      const company =
        known ||
        (
          await db
            .insert(companies)
            .values({ name: companyName, source: source.name, ownerId })
            .returning()
        )[0];
      if (known && !known.source) {
        await db
          .update(companies)
          .set({ source: source.name, updatedAt: new Date() })
          .where(eq(companies.id, known.id));
      }
      const [exists] = await db
        .select({ id: demands.id, externalId: demands.externalId })
        .from(demands)
        .where(
          and(
            eq(demands.ownerId, ownerId),
            or(
              eq(demands.externalId, externalId),
              and(
                eq(demands.source, source.name),
                eq(demands.title, title),
                eq(demands.companyId, company.id),
              ),
            ),
          ),
        )
        .limit(1);
      if (exists) {
        await db
          .update(demands)
          .set({
          externalId: exists.externalId || externalId,
          sourceUrl: detailUrl || source.url,
          demandText,
          technologies: extractTags(`${title} ${demandText}`),
          updatedAt: new Date(),
        })
          .where(eq(demands.id, exists.id));
        updated++;
        continue;
      }
      await db
        .insert(demands)
        .values({
          externalId,
          title,
          role: title,
          source: source.name,
          sourceUrl: detailUrl || source.url,
          location: "ČR",
          demandText,
          technologies: extractTags(`${title} ${demandText}`),
          companyId: company.id,
          ownerId,
        });
      created++;
    }
  }
  if (!found) warnings.push("Nebyla nalezena žádná shoda podle aktivních klíčových slov.");
  await db
    .update(importRuns)
    .set({
      status: warnings.length ? "completed_with_warnings" : "completed",
      completedAt: new Date(),
      receivedCount: parsed,
      createdCount: created,
      updatedCount: updated,
      skippedCount: skipped,
      errorSummary: warnings.length ? JSON.stringify({ warnings }) : null,
    })
    .where(eq(importRuns.id, run.id));
  await db
    .update(connectorSources)
    .set({ lastSuccessAt: new Date(), updatedAt: new Date() })
    .where(eq(connectorSources.id, connector.id));
  return NextResponse.json({
    parsed,
    found,
    created,
    updated,
    skipped,
    warnings,
    sources: sources.map((x) => x.name),
  });
}
export const GET = POST;
