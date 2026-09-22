import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sameCompanyIdentity } from "@/lib/matching";
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

const DEFAULT_MONITOR_KEYWORDS = [
  "IT Security",
  "Cybersecurity",
  "Kybernetická bezpečnost",
  "Kyberbezpečnost",
  "NIS2",
  "Zákon o kybernetické bezpečnosti",
  "Manažer kybernetické bezpečnosti",
  "MKB",
  "Architekt kybernetické bezpečnosti",
  "AKB",
  "Auditor kybernetické bezpečnosti",
  "Security Manager",
  "Security Architect",
  "Security Auditor",
  "CISO",
  "ISMS",
  "ISO 27001",
  "DORA",
  "SOC",
  "Incident Response",
  "Information Security",
];
const SOURCE_QUERIES = [
  "IT Security",
  "Cybersecurity",
  "Kybernetická bezpečnost",
  "NIS2",
  "Manažer kybernetické bezpečnosti",
  "Architekt kybernetické bezpečnosti",
  "Auditor kybernetické bezpečnosti",
  "ISMS",
  "ISO 27001",
];
const sources = SOURCE_QUERIES.flatMap((query) => [
  {
    name: "Jobs.cz",
    type: "html" as const,
    query,
    url: `https://www.jobs.cz/prace/?keywords=${encodeURIComponent(query)}`,
  },
  {
    name: "Prace.cz",
    type: "html" as const,
    query,
    url: `https://www.prace.cz/nabidky/?searchText=${encodeURIComponent(query)}`,
  },
]);
const feedSources = [
  {
    name: "ITjobs.cz",
    type: "rss" as const,
    query: "RSS IT pozice",
    url: "https://www.itjobs.cz/rss",
  },
];
const profesiaSources = SOURCE_QUERIES.slice(0, 6).map((query) => ({
  name: "Profesia.cz",
  type: "profesia" as const,
  query,
  url: `https://www.profesia.cz/prace/?search_anywhere=${encodeURIComponent(query)}`,
}));
const allSources = [...sources, ...feedSources, ...profesiaSources];
const decode = (s: string) => s.replace(/\\u0026/g, "&").replace(/\\"/g, '"');
const decodeHtml = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
const hasStandaloneTerm = (text: string, term: string) =>
  new RegExp(`(^|[^a-zá-ž0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zá-ž0-9]|$)`, "i").test(text);
const keywordMatches = (text: string, keyword: string) => {
  const lower = text.toLowerCase();
  const normalized = keyword.toLowerCase();
  if (["it", "ict", "qa", "ai"].includes(normalized)) return hasStandaloneTerm(lower, normalized);
  if (/^[a-z0-9.+#-]+$/i.test(normalized) && normalized.length <= 4) return hasStandaloneTerm(lower, normalized);
  return lower.includes(normalized);
};
const TAG_KEYWORDS = [
  "IT Security",
  "Cybersecurity",
  "Kybernetická bezpečnost",
  "Kyberbezpečnost",
  "Security",
  "SOC",
  "NIS2",
  "Zákon o kybernetické bezpečnosti",
  "Manažer kybernetické bezpečnosti",
  "MKB",
  "Architekt kybernetické bezpečnosti",
  "AKB",
  "Auditor kybernetické bezpečnosti",
  "Security Manager",
  "Security Architect",
  "Security Auditor",
  "CISO",
  "ISMS",
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
    keywordMatches(text, keyword),
  ).slice(0, 12);
const unavailableDetailText =
  "Detail inzerátu nebyl ve výpisu dostupný. Otevřete původní zdroj a zkontrolujte plné znění.";
function absoluteUrl(url: string, base: string) {
  try {
    return new URL(decodeHtml(url), base).toString();
  } catch {
    return null;
  }
}
function detailUrlFor(sourceHtml: string, itemId: string, baseUrl: string, title: string) {
  const escaped = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const candidates = [
    sourceHtml.match(new RegExp(`href="([^"]*(?:/pd/${escaped}|id=${escaped}|${escaped})[^"]*)"`, "i"))?.[1],
    sourceHtml.match(new RegExp(`\\"url\\":\\"([^\\"]*(?:/pd/${escaped}|id=${escaped}|${escaped})[^\\"]*)\\"`, "i"))?.[1],
    sourceHtml.match(new RegExp(`\\"link\\":\\"([^\\"]*(?:/pd/${escaped}|id=${escaped}|${escaped})[^\\"]*)\\"`, "i"))?.[1],
  ].filter(Boolean) as string[];
  const normalizedTitle = normalize(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (normalizedTitle) {
    const titleLink = sourceHtml.match(new RegExp(`href="([^"]*${normalizedTitle}[^"]*)"`, "i"))?.[1];
    if (titleLink) candidates.push(titleLink);
  }
  for (const candidate of candidates) {
    const url = absoluteUrl(decode(candidate), baseUrl);
    if (url) return url;
  }
  return null;
}
function textFromHtml(html: string) {
  const meta =
    html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ||
    html.match(/<meta property="og:description" content="([^"]*)"/i)?.[1] ||
    html.match(/"description"\s*:\s*"([^"]{80,})"/i)?.[1] ||
    html.match(/"jobDescription"\s*:\s*"([^"]{80,})"/i)?.[1];
  if (meta) return normalize(decodeHtml(meta));
  const jsonText = html.match(/"text"\s*:\s*"([^"]{120,})"/i)?.[1];
  if (jsonText) return normalize(decodeHtml(decode(jsonText)));
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
function titleFromHtml(html: string) {
  return normalize(
    decodeHtml(
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ") ||
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s*\|\s*.*$/, "") ||
        "",
    ),
  );
}
function companyFromHtml(html: string) {
  const candidates = [
    html.match(/alt="([^"]*(?:s\.r\.o\.|a\.s\.|spol\.|ltd|inc)[^"]*)"/i)?.[1],
    html.match(/"hiringOrganization"[\s\S]{0,500}?"name"\s*:\s*"([^"]+)"/i)?.[1],
    html.match(/"companyName"\s*:\s*"([^"]+)"/i)?.[1],
    html.match(/"employer"\s*:\s*"([^"]+)"/i)?.[1],
  ].filter(Boolean) as string[];
  return normalize(decodeHtml(decode(candidates[0] || "")));
}
function extractJobLinks(html: string, sourceUrl: string) {
  const items = new Map<string, { id: string; title: string; company: string; url: string }>();
  for (const match of html.matchAll(/<article[^>]*id="advert-([^"]+)"[\s\S]*?<\/article>/gi)) {
    const block = match[0];
    const href = block.match(/<a[^>]+(?:data-testid="advert-link"[^>]+)?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!href) continue;
    const url = absoluteUrl(href[1], sourceUrl);
    const title = normalize(decodeHtml(href[2].replace(/<[^>]+>/g, " ")));
    const company = normalize(decodeHtml(block.match(/<img[^>]+alt="([^"]+)"/i)?.[1] || ""));
    if (url && title) items.set(url, { id: match[1], title, company, url });
  }
  for (const match of html.matchAll(/<a[^>]+href="([^"]*(?:\/nabidka\/|\/pd\/)[^"]*)"[^>]*>([\s\S]{3,220}?)<\/a>/gi)) {
    const url = absoluteUrl(match[1], sourceUrl);
    const title = normalize(decodeHtml(match[2].replace(/<[^>]+>/g, " ")));
    if (!url || !title || /^číst hodnocení$/i.test(title) || /^zobrazit více$/i.test(title)) continue;
    const id =
      url.match(/\/nabidka\/([^/?]+)/)?.[1] ||
      url.match(/\/pd\/([^/?]+)/)?.[1] ||
      `${sourceUrl}:${title}`.slice(0, 120);
    if (!items.has(url)) items.set(url, { id, title, company: "", url });
  }
  return [...items.values()];
}
function extractRssItems(xml: string, sourceUrl: string) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const block = match[1];
      const title = normalize(decodeHtml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || ""));
      const description = normalize(
        decodeHtml(
          block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "",
        ).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "),
      );
      const url = normalize(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || sourceUrl);
      const id = normalize(block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] || url || title);
      return {
        id,
        title,
        company: "ITjobs.cz, klient",
        url,
        description,
      };
    })
    .filter((item) => item.title);
}
function extractProfesiaItems(html: string, sourceUrl: string) {
  return [...html.matchAll(/<li class="list-row"[^>]*>([\s\S]*?)(?=<li class="list-row"|<\/ul>)/gi)]
    .map((match) => {
      const block = match[1];
      const link = block.match(/<h2>\s*<a[^>]+id="offer([^"]+)"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
      if (!link) return null;
      const title = normalize(
        decodeHtml(
          link[3]
            .replace(/<span[^>]*class=['"]title['"][^>]*>([\s\S]*?)<\/span>/i, "$1")
            .replace(/<[^>]+>/g, " "),
        ),
      );
      const company = normalize(decodeHtml(block.match(/<span class=['"]employer['"]>([\s\S]*?)<\/span>/i)?.[1] || ""));
      const location = normalize(decodeHtml(block.match(/<span[^>]+class=['"]job-location['"][^>]*>([\s\S]*?)<\/span>/i)?.[1]?.replace(/<[^>]+>/g, " ") || ""));
      const url = absoluteUrl(link[2], sourceUrl) || sourceUrl;
      return {
        id: link[1],
        title,
        company,
        url,
        description: location ? `Lokalita: ${location}` : "",
      };
    })
    .filter(Boolean) as { id: string; title: string; company: string; url: string; description: string }[];
}
async function fetchDemandDetail(url: string | null): Promise<{ text: string | null; reason: string | null }> {
  if (!url) return { text: null, reason: "nebyl nalezen odkaz na detail" };
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NEOVIA Demand Intelligence/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!response.ok) return { text: null, reason: `detail vrátil stav ${response.status}` };
    const html = await response.text();
    const text = textFromHtml(html);
    return {
      text,
      reason: text ? null : "detail neobsahoval čitelný text inzerátu",
    };
  } catch {
    return { text: null, reason: "detail se nepodařilo stáhnout" };
  }
}
function relevanceFor(text: string) {
  const matches = TAG_KEYWORDS.filter((keyword) => keywordMatches(text, keyword)).length;
  return Math.min(100, Math.max(20, matches * 12));
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
  const keywords = [
    ...new Set([...(settings?.keywords || []), ...DEFAULT_MONITOR_KEYWORDS]),
  ].map((x) => x.toLowerCase());
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
  const allCompanies = await db
    .select()
    .from(companies)
    .where(eq(companies.ownerId, ownerId));
  for (const source of allSources) {
    let html = "";
    try {
      const response = await fetch(source.url, {
        headers: { "User-Agent": "NEOVIA Demand Intelligence/1.0" },
        cache: "no-store",
      });
      if (!response.ok) {
        warnings.push(`${source.name} ${source.query}: zdroj vrátil stav ${response.status}.`);
        skipped++;
        continue;
      }
      html = await response.text();
    } catch (error) {
      warnings.push(
        `${source.name} ${source.query}: stránku se nepodařilo stáhnout, ${
          error instanceof Error ? error.message : "neznámá chyba"
        }.`,
      );
      skipped++;
      continue;
    }
    const matches = source.type === "rss"
      ? extractRssItems(html, source.url)
      : source.type === "profesia"
        ? extractProfesiaItems(html, source.url)
        : [
          ...[
            ...html.matchAll(
              /\\"item_id\\":\\"([^\\"]+)\\"[\s\S]{0,700}?\\"item_name\\":\\"([^\\"]+)\\"[\s\S]{0,700}?\\"item_brand\\":\\"([^\\"]*)\\"/g,
            ),
          ].map((m) => {
            const title = normalize(decode(m[2]));
            return {
              id: m[1],
              title,
              company: normalize(decode(m[3]).replace(/\s+\d+$/, "")),
              url: detailUrlFor(html, m[1], source.url, title) || "",
              description: "",
            };
          }),
          ...extractJobLinks(html, source.url).map((item) => ({ ...item, description: "" })),
        ];
    const uniqueMatches = [...new Map(matches.filter((item) => item.title).map((item) => [item.url || `${item.id}:${item.title}`, item])).values()];
    parsed += uniqueMatches.length;
    if (!uniqueMatches.length) {
      warnings.push(
        `${source.name} ${source.query}: zdroj neobsahoval čitelný seznam inzerátů. U Jobs.cz může být seznam vykreslený až v prohlížeči a server ho nevrací.`,
      );
    }
    for (const item of uniqueMatches.slice(0, 80)) {
      const title = item.title;
      let companyName = item.company || "";
      const text = `${title} ${companyName} ${item.description || ""}`.toLowerCase();
      if (
        !keywords.some((k) => text.includes(k)) ||
        excluded.some((k) => text.includes(k))
      ) {
        skipped++;
        continue;
      }
      found++;
      const externalId = `${source.name}:${item.id}`;
      const detailUrl = item.url || detailUrlFor(html, item.id, source.url, title);
      const detail = source.type === "rss" && item.description
        ? { text: item.description, reason: null }
        : await fetchDemandDetail(detailUrl);
      if ((!companyName || companyName === "Neznámá firma") && detailUrl) {
        try {
          const detailResponse = await fetch(detailUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; NEOVIA Demand Intelligence/1.0)" },
            cache: "no-store",
          });
          if (detailResponse.ok) {
            const detailHtml = await detailResponse.text();
            companyName = companyFromHtml(detailHtml) || companyName;
          }
        } catch {}
      }
      companyName = companyName || "Neznámá firma";
      const demandText = detail.text || unavailableDetailText;
      if (!detailUrl)
        warnings.push(`${source.name}: u inzerátu ${title} nebyl nalezen odkaz na detail.`);
      if (!detail.text)
        warnings.push(`${source.name}: u inzerátu ${title} se nepodařilo vytěžit plné znění, ${detail.reason}.`);
      const known = allCompanies.find((company) =>
        sameCompanyIdentity(company, { name: companyName }).same,
      );
      let company = known;
      if (!company) {
        [company] = await db
          .insert(companies)
          .values({ name: companyName, source: source.name, ownerId })
          .returning();
        allCompanies.push(company);
      }
      if (known && !known.source) {
        await db
          .update(companies)
          .set({ source: source.name, updatedAt: new Date() })
          .where(eq(companies.id, known.id));
      }
      const [exists] = await db
        .select({ id: demands.id, externalId: demands.externalId, deletedAt: demands.deletedAt })
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
      if (exists?.deletedAt) {
        skipped++;
        continue;
      }
      if (exists) {
        await db
          .update(demands)
          .set({
          externalId: exists.externalId || externalId,
          sourceUrl: detailUrl || source.url,
          demandText,
          relevanceScore: relevanceFor(`${title} ${demandText}`),
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
          relevanceScore: relevanceFor(`${title} ${demandText}`),
          technologies: extractTags(`${title} ${demandText}`),
          companyId: company.id,
          ownerId,
        });
      created++;
    }
  }
    if (!found) warnings.push("Nebyla nalezena žádná shoda podle aktivních klíčových slov.");
    if (skipped) warnings.push(`${skipped} poptávek bylo přeskočeno, protože jsou v koši.`);
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
    sources: [...new Set(allSources.map((x) => x.name))],
  });
}
export const GET = POST;
