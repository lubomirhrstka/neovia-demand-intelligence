/**
 * Doplnění firmy / pozice / lokality z veřejné LinkedIn stránky pozice.
 * Spolehlivější než heuristiky z e-mailu: OG title má formát
 *   "{Firma} hiring {Pozice} in {Lokalita} | LinkedIn"
 * Guest API vrací topcard s title / org / location.
 */

export type LinkedInJobMeta = {
  title: string;
  company: string;
  location: string;
  source: "og-title" | "guest-topcard";
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Extrahuje job ID z URL typu .../jobs/view/123456 nebo tracking odkazů. */
export function extractLinkedInJobId(urlOrId: string): string | null {
  const raw = (urlOrId || "").trim();
  if (!raw) return null;
  if (/^\d{6,}$/.test(raw)) return raw;
  const m =
    raw.match(/\/jobs\/view\/(\d+)/i) ||
    raw.match(/[?&]jobId=(\d+)/i) ||
    raw.match(/jobPosting[:/](\d+)/i) ||
    raw.match(/(?:^|[^\d])(\d{8,12})(?:[^\d]|$)/);
  return m?.[1] || null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

/** "{Firma} hiring {Pozice} in {Lokalita} | LinkedIn" */
export function parseHiringTitle(title: string): LinkedInJobMeta | null {
  const cleaned = decodeHtmlEntities(title)
    .replace(/\s*\|\s*LinkedIn\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  // English OG: Company hiring Role in Location
  let m = cleaned.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+)$/i);
  if (m) {
    return {
      company: m[1].trim(),
      title: m[2].trim(),
      location: m[3].trim(),
      source: "og-title",
    };
  }

  // Czech-ish variants sometimes seen in localized titles
  m = cleaned.match(/^(.+?)\s+hledá\s+(.+?)\s+(?:v|ve|na)\s+(.+)$/i);
  if (m) {
    return {
      company: m[1].trim(),
      title: m[2].trim(),
      location: m[3].trim(),
      source: "og-title",
    };
  }

  return null;
}

function parseGuestTopcard(html: string): LinkedInJobMeta | null {
  const titleMatch =
    html.match(/top-card-layout__title[^>]*>([^<]+)/i) ||
    html.match(/topcard__title[^>]*>([^<]+)/i) ||
    html.match(/data-tracking-control-name="public_jobs_topcard-title"[^>]*>\s*([^<]+)/i);
  const companyMatch =
    html.match(/public_jobs_topcard-org-name[^"]*"[^>]*>([^<]+)/i) ||
    html.match(/topcard__org-name-link[^>]*>([^<]+)/i);
  const locationMatch = html.match(/topcard__flavor--bullet[^>]*>([^<]+)/i);

  const title = decodeHtmlEntities(titleMatch?.[1] || "");
  const company = decodeHtmlEntities(companyMatch?.[1] || "");
  const location = decodeHtmlEntities(locationMatch?.[1] || "");
  if (!title || title.length < 2) return null;
  if (!company || company.length < 2) return null;
  return { title, company, location, source: "guest-topcard" };
}

function extractOgTitle(html: string): string | null {
  const patterns = [
    /property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m?.[1]) return decodeHtmlEntities(m[1]);
  }
  return null;
}

async function fetchText(url: string, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Načte metadata pozice z veřejné LinkedIn stránky / guest API.
 * Preferuje OG title, fallback na guest topcard.
 */
export async function enrichLinkedInJob(urlOrId: string): Promise<LinkedInJobMeta | null> {
  const jobId = extractLinkedInJobId(urlOrId);
  if (!jobId) return null;

  // 1) Full public job page — OG title is the most reliable
  const pageHtml = await fetchText(`https://www.linkedin.com/jobs/view/${jobId}`);
  if (pageHtml) {
    const og = extractOgTitle(pageHtml);
    if (og) {
      const parsed = parseHiringTitle(og);
      if (parsed) return parsed;
    }
  }

  // 2) Guest job posting API — structured topcard without login
  const guestHtml = await fetchText(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`);
  if (guestHtml) {
    const topcard = parseGuestTopcard(guestHtml);
    if (topcard) return topcard;
  }

  return null;
}

/** Obohatí seznam jobů (max `limit` paralelních requestů, s limitem celkového počtu). */
export async function enrichLinkedInJobs<
  T extends { externalId?: string; url?: string; title: string; company: string; location: string },
>(jobs: T[], options?: { limit?: number; concurrency?: number }): Promise<{ jobs: T[]; enriched: number }> {
  const limit = Math.max(0, options?.limit ?? 12);
  const concurrency = Math.max(1, Math.min(4, options?.concurrency ?? 3));
  if (!limit || !jobs.length) return { jobs, enriched: 0 };

  let enriched = 0;
  const targets = jobs
    .map((job, index) => ({ job, index, id: extractLinkedInJobId(job.url || job.externalId || "") }))
    .filter((item) => item.id)
    .slice(0, limit);

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (item) => {
        const meta = await enrichLinkedInJob(item.id!);
        return { ...item, meta };
      }),
    );
    for (const result of results) {
      if (!result.meta) continue;
      const job = jobs[result.index];
      if (result.meta.title) job.title = result.meta.title.slice(0, 220);
      if (result.meta.company) job.company = result.meta.company.slice(0, 180);
      if (result.meta.location) job.location = result.meta.location.slice(0, 180);
      enriched += 1;
    }
  }

  return { jobs, enriched };
}
