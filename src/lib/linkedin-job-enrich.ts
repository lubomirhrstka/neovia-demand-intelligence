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
  /** Celý text inzerátu z guest API (pokud je dostupný). */
  description?: string;
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
  // Pozor: entity skládáme přes "&" + "amp;" — při zápisu souboru přes některé nástroje
  // se doslovné "&amp;" samo dekódovalo na "&" a funkce pak nedělala nic.
  const AMP = "&" + "amp;";
  const QUOT = "&" + "quot;";
  const LT = "&" + "lt;";
  const GT = "&" + "gt;";
  const once = (v: string) =>
    v
      .split(QUOT).join('"')
      .split(LT).join("<")
      .split(GT).join(">")
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, " ")
      .split(AMP).join("&");
  // LinkedIn občas kóduje dvojitě ("&amp;amp;") → dekódujeme, dokud se hodnota mění (max 3×)
  let out = value;
  for (let i = 0; i < 3; i += 1) {
    const next = once(out);
    if (next === out) break;
    out = next;
  }
  return out.replace(/\u00a0/g, " ").trim();
}

/** Odstraní šum, který zaměstnavatelé dávají přímo do názvu pozice ("Job Title (EN): …"). */
function cleanRoleTitle(value: string) {
  return value.replace(/^\s*(job title|název pozice|pozice)\s*(\([a-z]{2}\))?\s*:\s*/i, "").trim();
}

const WORK_MODE = /\((Hybrid|Hybridní|Remote|Na dálku|Na místě|On-site|Onsite)\)/i;
/** Titulek stránky uvádí jen město — režim práce (Hybrid/Remote) z alertu nechceme ztratit. */
export function mergeWorkMode(newLocation: string, oldLocation: string | null | undefined) {
  const mode = (oldLocation || "").match(WORK_MODE)?.[0];
  if (!mode || !newLocation || WORK_MODE.test(newLocation)) return newLocation;
  return `${newLocation} ${mode}`;
}

/**
 * LinkedIn vrací titulek pozice ve více formátech podle jazyka / hlaviček požadavku:
 *   "Firma hiring Pozice in Lokalita | LinkedIn"
 *   "Pozice at Firma — Lokalita | LinkedIn Jobs"
 *   "Pozice ve společnosti Firma – Lokalita | Pracovní příležitosti LinkedIn"
 * Dřív parser znal jen první variantu → s Accept-Language cs-CZ selhávalo obohacení u všech pozic.
 */
export function parseHiringTitle(title: string): LinkedInJobMeta | null {
  const cleaned = decodeHtmlEntities(title)
    .replace(/\s*\|\s*(Pracovní příležitosti LinkedIn|LinkedIn Jobs|LinkedIn)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const meta = (company: string, role: string, location: string): LinkedInJobMeta => ({
    company: company.trim(),
    title: cleanRoleTitle(role),
    location: location.trim(),
    source: "og-title",
  });

  // 1) "Firma hiring Pozice in Lokalita"
  let m = cleaned.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+)$/i);
  if (m) return meta(m[1], m[2], m[3]);

  // 2) "Pozice ve společnosti Firma – Lokalita" (čeština)
  m = cleaned.match(/^(.+)\s+ve společnosti\s+(.+?)\s+[–—-]\s+(.+)$/i);
  if (m) return meta(m[2], m[1], m[3]);

  // 3) "Pozice at Firma — Lokalita" (angličtina; role může obsahovat "at", proto poslední výskyt)
  m = cleaned.match(/^(.+)\s+at\s+(.+?)\s+[–—-]\s+(.+)$/i);
  if (m) return meta(m[2], m[1], m[3]);

  // 4) Starší česká varianta "Firma hledá Pozice v Lokalita"
  m = cleaned.match(/^(.+?)\s+hledá\s+(.+?)\s+(?:v|ve|na)\s+(.+)$/i);
  if (m) return meta(m[1], m[2], m[3]);

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

  const title = cleanRoleTitle(decodeHtmlEntities(titleMatch?.[1] || ""));
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

  // 1) Guest job posting API — jediný požadavek vrátí firmu, pozici, lokalitu i CELÝ text inzerátu
  const guestHtml = await fetchText(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`);
  const description = guestHtml ? parseGuestDescription(guestHtml) : "";
  if (guestHtml) {
    const topcard = parseGuestTopcard(guestHtml);
    if (topcard) return { ...topcard, description: description || undefined };
  }

  // 2) Fallback: veřejná stránka pozice — titulek ve 3 formátech (viz parseHiringTitle)
  const pageHtml = await fetchText(`https://www.linkedin.com/jobs/view/${jobId}`);
  if (pageHtml) {
    const og = extractOgTitle(pageHtml);
    if (og) {
      const parsed = parseHiringTitle(og);
      if (parsed) return { ...parsed, description: description || undefined };
    }
  }

  return null;
}

/** Celý text inzerátu z guest API (blok "show-more-less-html__markup"), převedený na čistý text. */
function parseGuestDescription(html: string): string {
  const m = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return "";
  return decodeHtmlEntities(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|h\d)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n+/g, "\n\n"),
  )
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim()
    .slice(0, 12000);
}

/** Obohatí seznam jobů (max `limit` paralelních requestů, s limitem celkového počtu). */
export async function enrichLinkedInJobs<
  T extends { externalId?: string; url?: string; title: string; company: string; location: string; detail?: string },
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
      if (isPlausibleCompany(result.meta.company)) job.company = result.meta.company.slice(0, 180);
      const cleanLoc = cleanLinkedInLocation(result.meta.location);
      if (cleanLoc) job.location = mergeWorkMode(cleanLoc, job.location);
      // Skutečný text inzerátu má přednost před výřezem z e-mailového alertu
      if (result.meta.description && result.meta.description.length > 80) job.detail = result.meta.description;
      enriched += 1;
    }
  }

  // Lokalitu čistíme i u jobů, které se obohatit nepodařilo (šum z e-mailu).
  for (const job of jobs) job.location = cleanLinkedInLocation(job.location);

  return { jobs, enriched };
}

/**
 * Vyčistí lokalitu z LinkedIn alertu — e-mailový text k ní lepí šum:
 * mzdové rozpětí ("1,4 mil. Kč–2,1 mil. Kč/ rok"), "Probíhá nábor",
 * "Snadná žádost", počet spojení ("Praha 1" / "Praha (Hybrid) 2").
 */
export function cleanLinkedInLocation(value: string | null | undefined): string {
  let v = (value || "").replace(/\s+/g, " ").trim();
  if (!v) return "";
  v = v
    .replace(/\b(Probíhá nábor|Actively recruiting|Snadná žádost|Easy Apply|Promoted|Propagováno)\b.*$/i, "")
    .replace(/\d[\d\s,.]*\s*(mil\.|tis\.|K)?\s*(Kč|CZK|EUR|€|\$)[\s\S]*$/i, "")
    .replace(/\s+\d{1,3}\s*(spojení|connections?)\s*$/i, "")
    // "Praha (Hybrid) 2" → počet spojení za závorkou; "Praha 1" necháváme (může jít o obvod)
    .replace(/\)\s+\d{1,3}\s*$/, ")")
    .replace(/[–\-·|,;]+\s*$/g, "")
    .trim();
  // pojistka: URL fragment nebo nesmysl není lokalita
  if (/https?:|trackingid|refid|\/(view|jobs|comm)\//i.test(v)) return "";
  return v.slice(0, 120);
}

/** Sanity check výsledku obohacení — chrání před uložením evidentního odpadu jako firmy. */
export function isPlausibleCompany(value: string | null | undefined): boolean {
  const v = (value || "").trim();
  if (v.length < 2 || v.length > 160) return false;
  if (/^job title|^firma neuvedena|linkedin$/i.test(v)) return false;
  if (/https?:|trackingid|refid|%2[a-f0-9]|\/(view|jobs|comm)\//i.test(v)) return false;
  if (v.length > 30 && !v.includes(" ") && /[/?=&]/.test(v)) return false;
  return true;
}
