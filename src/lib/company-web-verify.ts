import { getDb } from "./db";
import { companies, contacts } from "./schema";
import { and, eq, or } from "drizzle-orm";

const CAREER_PATHS = [
  "/kariera",
  "/kariéra",
  "/career",
  "/careers",
  "/jobs",
  "/volne-pozice",
  "/volná-místa",
  "/pracovni-pozice",
  "/kontakt",
  "/contact",
];

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "seznam.cz", "email.cz", "post.cz", "volny.cz",
  "centrum.cz", "atlas.cz", "hotmail.com", "outlook.com", "live.com", "yahoo.com",
  "icloud.com", "me.com", "proton.me", "protonmail.com",
]);

const normalizeUrl = (value: string) => {
  const clean = value.trim().replace(/[)"'<>.,;]+$/g, "");
  if (!clean) return "";
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
};
const hostnameOf = (value: string) => {
  try {
    return new URL(normalizeUrl(value)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};
const domainFromEmail = (value: string) => {
  const domain = value.toLowerCase().split("@")[1]?.replace(/^www\./, "") || "";
  return domain && !FREE_EMAIL_DOMAINS.has(domain) ? domain : "";
};
const extractUrls = (text: string) =>
  [...text.matchAll(/https?:\/\/[^\s<>"')]+/gi)].map((match) => normalizeUrl(match[0])).filter(Boolean);
const extractEmails = (text: string) =>
  [...new Set([...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase()))]
    .filter((email) => !/noreply|no-reply|example|sentry|linkedin|google|facebook/.test(email));
const extractPhones = (text: string) =>
  [...new Set([...text.matchAll(/(?:\+420|00420)?[\s.-]?(?:\d{3}[\s.-]?){3}/g)].map((match) => match[0].trim()))]
    .filter((phone) => phone.replace(/\D/g, "").length >= 9);
const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function fetchText(url: string, timeoutMs = 6500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "LeadHunter CRM contact verification (+https://leadhunter-lh.vercel.app)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    const html = await response.text();
    return { url: response.url || url, html, text: stripHtml(html) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const companyNameToDomainCandidate = (name: string) => {
  const base = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(s\.?r\.?o\.?|a\.?s\.?|spol\.?|inc|ltd|gmbh)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  return base.length >= 3 ? `https://${base}.cz` : "";
};

const candidateRoots = (companyName: string, website?: string | null, demandText?: string | null, sourceUrl?: string | null) => {
  const urls = [website || "", ...(demandText ? extractUrls(demandText) : []), sourceUrl || ""]
    .map(normalizeUrl)
    .filter(Boolean)
    .filter((url) => {
      const host = hostnameOf(url);
      return host && !/linkedin\.com|google\.com|mail\.google\.com|seznam\.cz/.test(host);
    });
  const guessed = companyNameToDomainCandidate(companyName);
  if (guessed) urls.push(guessed);
  const uniqueHosts = new Map<string, string>();
  for (const url of urls) {
    const host = hostnameOf(url);
    if (host && !uniqueHosts.has(host)) uniqueHosts.set(host, new URL(url).origin);
  }
  return [...uniqueHosts.values()].slice(0, 4);
};

const scoreCareerUrl = (url: string, text: string, title: string) => {
  const haystack = `${url} ${text}`.toLowerCase();
  let score = 0;
  if (/kariera|kariéra|career|jobs|volne|volná|pracovni|pozice/.test(haystack)) score += 35;
  for (const word of title.toLowerCase().split(/\s+/).filter((x) => x.length > 3)) {
    if (haystack.includes(word)) score += 8;
  }
  return score;
};

export type VerifyCompanyInput = {
  ownerId: string;
  companyId: string;
  companyName: string;
  companyWebsite?: string | null;
  companyNote?: string | null;
  demandTitle: string;
  demandText?: string | null;
  demandSourceUrl?: string | null;
  /** Nižší limit pro automatické ověření při importu — než ruční "Ověřit web a kontakty" (24 URL, plný timeout). */
  maxUrls?: number;
  timeoutMs?: number;
};

export type VerifyCompanyResult = {
  checked: number;
  website: string | null;
  careerUrl: string | null;
  emails: string[];
  phones: string[];
  contactsCreated: number;
};

/** Sdílené jádro ověření firemního webu — používá jak ruční tlačítko "Ověřit web a kontakty",
 *  tak automatické ověření při importu nové poptávky. */
export async function verifyCompanyWeb(input: VerifyCompanyInput): Promise<VerifyCompanyResult | null> {
  const roots = candidateRoots(input.companyName, input.companyWebsite, input.demandText, input.demandSourceUrl);
  if (!roots.length) return null;

  const maxUrls = input.maxUrls ?? 24;
  const timeoutMs = input.timeoutMs ?? 6500;
  const checked: string[] = [];
  const pages: Array<{ url: string; text: string; score: number }> = [];
  for (const root of roots) {
    const urls = [root, ...CAREER_PATHS.map((path) => new URL(path, root).toString())];
    for (const url of urls) {
      if (checked.includes(url) || checked.length >= maxUrls) continue;
      checked.push(url);
      const page = await fetchText(url, timeoutMs);
      if (!page) continue;
      pages.push({ url: page.url, text: page.text, score: scoreCareerUrl(page.url, page.text, input.demandTitle) });
    }
  }
  if (!pages.length) return { checked: checked.length, website: null, careerUrl: null, emails: [], phones: [], contactsCreated: 0 };

  const bestRoot = pages[0]?.url ? new URL(pages[0].url).origin : roots[0];
  const bestCareer = [...pages].sort((a, b) => b.score - a.score)[0];
  const text = pages.map((page) => page.text).join("\n");
  const emails = extractEmails(text);
  const phones = extractPhones(text);
  const companyDomain = hostnameOf(bestRoot);
  const companyEmails = emails.filter((email) => domainFromEmail(email) === companyDomain || domainFromEmail(email).endsWith(`.${companyDomain}`));
  const selectedEmails = (companyEmails.length ? companyEmails : emails).slice(0, 3);
  const selectedPhones = phones.slice(0, 3);

  const db = getDb();
  const patch: { website?: string; note?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (!input.companyWebsite && bestRoot) patch.website = bestRoot;
  const careerNote = bestCareer?.score ? `Kariérní stránka ověřená z webu: ${bestCareer.url}` : "";
  if (careerNote && !(input.companyNote || "").includes(bestCareer.url)) {
    patch.note = [input.companyNote, careerNote].filter(Boolean).join("\n");
  }
  if (patch.website || patch.note) {
    await db.update(companies).set(patch).where(and(eq(companies.id, input.companyId), eq(companies.ownerId, input.ownerId)));
  }

  let contactsCreated = 0;
  for (let index = 0; index < Math.max(selectedEmails.length, selectedPhones.length); index += 1) {
    const email = selectedEmails[index] || null;
    const phone = selectedPhones[index] || null;
    if (!email && !phone) continue;
    const duplicateRule = email && phone
      ? or(eq(contacts.email, email), eq(contacts.secondaryEmail, email), eq(contacts.phone, phone), eq(contacts.secondaryPhone, phone))
      : email
        ? or(eq(contacts.email, email), eq(contacts.secondaryEmail, email))
        : or(eq(contacts.phone, phone!), eq(contacts.secondaryPhone, phone!));
    const existing = await db.select({ id: contacts.id }).from(contacts)
      .where(and(eq(contacts.ownerId, input.ownerId), duplicateRule!))
      .limit(1);
    if (existing.length) continue;
    await db.insert(contacts).values({
      firstName: "Kontakt",
      lastName: input.companyName,
      role: "Kontakt z firemního webu",
      email,
      phone,
      source: "Firemní web",
      verified: true,
      companyId: input.companyId,
      ownerId: input.ownerId,
    });
    contactsCreated += 1;
  }

  return {
    checked: checked.length,
    website: patch.website || input.companyWebsite || bestRoot,
    careerUrl: bestCareer?.score ? bestCareer.url : null,
    emails: selectedEmails,
    phones: selectedPhones,
    contactsCreated,
  };
}
