import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { normalizeCompanyName, sameCompanyIdentity } from "@/lib/matching";
import { companies, connectorSources, contacts, demands, importRuns, monitorSettings, users } from "@/lib/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const INDEX_URL = "https://data.mpsv.cz/od/soubory/volna-mista-prirustek/";
const IT_ROLE_KEYWORDS = [
  "software",
  "developer",
  "vývojář",
  "programátor",
  "java",
  ".net",
  "python",
  "devops",
  "cloud",
  "kyber",
  "kybernetická bezpečnost",
  "kyberbezpečnost",
  "cyber",
  "security",
  "bezpečnost",
  "nis2",
  "zákon o kybernetické bezpečnosti",
  "manažer kybernetické bezpečnosti",
  "architekt kybernetické bezpečnosti",
  "auditor kybernetické bezpečnosti",
  "mkb",
  "akb",
  "isms",
  "iso 27001",
  "ciso",
  "security manager",
  "security architect",
  "security auditor",
  "incident response",
  "síť",
  "network",
  "data engineer",
  "databáz",
  "sap",
  "linux",
  "aws",
  "azure",
  "kubernetes",
  "tester",
  "qa",
];
const MAX_ITEMS_PER_RUN = 120;
const TAG_KEYWORDS = [
  "IT",
  "ICT",
  "Software",
  "Developer",
  "Vývojář",
  "Programátor",
  "Java",
  ".NET",
  "Python",
  "DevOps",
  "Cloud",
  "Cybersecurity",
  "Security",
  "Bezpečnost",
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
  "Incident Response",
  "Network",
  "Data",
  "SAP",
  "Linux",
  "AWS",
  "Azure",
  "Kubernetes",
  "Tester",
  "QA",
];

type MpsvItem = {
  portalId: number; referencniCislo?: string; datumVlozeni?: string; datumZmeny?: string; mesicniMzdaOd?: number; mesicniMzdaDo?: number;
  pozadovanaProfese?: { cs?: string }; upresnujiciInformace?: { cs?: string }; zamestnavatel?: { ico?: string; nazev?: string };
  mistoVykonuPrace?: {
    obec?: { cs?: string } | null;
    adresaText?: string | null;
    pracoviste?: {
      email?: string | null;
      telefon?: string | null;
      nazev?: string | null;
      adresa?: { ulice?: { nazev?: string | null } | null; psc?: string | null } | null;
    }[];
  };
  prvniKontaktSeZamestnavatelem?: {
    komuSeHlasit?: {
      email?: string | null;
      telefon?: string | null;
      jmeno?: string | null;
      prijmeni?: string | null;
      poziceVeSpolecnosti?: string | null;
    };
  };
};

const normalize = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ");
const hasStandaloneTerm = (text: string, term: string) =>
  new RegExp(`(^|[^a-zá-ž0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zá-ž0-9]|$)`, "i").test(text);
const keywordMatches = (text: string, keyword: string) => {
  const lower = text.toLowerCase();
  const normalized = keyword.toLowerCase();
  if (["it", "ict", "qa", "ai"].includes(normalized)) return hasStandaloneTerm(lower, normalized);
  if (/^[a-z0-9.+#-]+$/i.test(normalized) && normalized.length <= 4) return hasStandaloneTerm(lower, normalized);
  return lower.includes(normalized);
};
const isItRole = (title: string) => {
  const lower = title.toLowerCase();
  return hasStandaloneTerm(lower, "it") || hasStandaloneTerm(lower, "ict") || IT_ROLE_KEYWORDS.some((keyword) => keywordMatches(lower, keyword));
};
function locationOf(item: MpsvItem) {
  const workplace = item.mistoVykonuPrace?.pracoviste?.[0];
  const parts = [
    item.mistoVykonuPrace?.adresaText,
    item.mistoVykonuPrace?.obec?.cs,
    workplace?.adresa?.ulice?.nazev,
    workplace?.adresa?.psc,
  ].map(normalize).filter(Boolean);
  return parts.length ? [...new Set(parts)].join(", ") : "ČR";
}
function contactFrom(item: MpsvItem) {
  const primary = item.prvniKontaktSeZamestnavatelem?.komuSeHlasit;
  const workplace = item.mistoVykonuPrace?.pracoviste?.[0];
  const fullName = normalize([primary?.jmeno, primary?.prijmeni].filter(Boolean).join(" "));
  const hasNamedPerson = Boolean(normalize(primary?.jmeno) || normalize(primary?.prijmeni));
  return {
    email: normalize(primary?.email || workplace?.email).toLowerCase(),
    telefon: normalize(primary?.telefon || workplace?.telefon),
    jmeno: fullName || "Kontakt MPSV",
    role: normalize(primary?.poziceVeSpolecnosti),
    hasNamedPerson,
  };
}
function salaryText(item: MpsvItem) {
  if (!item.mesicniMzdaOd && !item.mesicniMzdaDo) return "";
  if (item.mesicniMzdaOd && item.mesicniMzdaDo) return `Mzda ${item.mesicniMzdaOd.toLocaleString("cs-CZ")} až ${item.mesicniMzdaDo.toLocaleString("cs-CZ")} Kč měsíčně.`;
  if (item.mesicniMzdaOd) return `Mzda od ${item.mesicniMzdaOd.toLocaleString("cs-CZ")} Kč měsíčně.`;
  return `Mzda do ${item.mesicniMzdaDo?.toLocaleString("cs-CZ")} Kč měsíčně.`;
}
const extractTags = (text: string) =>
  TAG_KEYWORDS.filter((keyword) =>
    keywordMatches(text, keyword),
  ).slice(0, 12);
const relevanceFor = (text: string) => {
  const matches = TAG_KEYWORDS.filter((keyword) =>
    keywordMatches(text, keyword),
  ).length;
  return Math.min(100, Math.max(20, matches * 12));
};

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const db = getDb();
  const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (actor?.role !== "admin") return NextResponse.json({ error: "Import veřejných zdrojů může spouštět jen správce." }, { status: 403 });

  const [source] = await db.select().from(connectorSources).where(eq(connectorSources.key, "mpsv-open-data")).limit(1);
  const connector = source || (await db.insert(connectorSources).values({ key: "mpsv-open-data", name: "MPSV, volná místa", kind: "official_api", status: "active", termsUrl: "https://data.mpsv.cz/web/data/volna-mista-za-celou-cr", refreshMinutes: 1440, createdById: session.user.id }).returning())[0];
  const [run] = await db.insert(importRuns).values({ sourceId: connector.id, status: "running", startedAt: new Date(), triggeredById: session.user.id }).returning();

  try {
    const indexHtml = await (await fetch(INDEX_URL, { next: { revalidate: 0 } })).text();
    const files = [...indexHtml.matchAll(/volna-mista-prirustek-(\d{4}-\d{2}-\d{2})\.json/g)].map(match => match[0]);
    const latest = files.sort().at(-1);
    if (!latest) throw new Error("V otevřených datech MPSV nebyl nalezen aktuální soubor.");
    const payload = await (await fetch(`${INDEX_URL}${latest}`, { next: { revalidate: 0 } })).json() as { polozky?: MpsvItem[] };
    const allRows = payload.polozky || [];
    const matchedRows = allRows.filter(item => isItRole(item.pozadovanaProfese?.cs || ""));
    const relevant = matchedRows.slice(0, MAX_ITEMS_PER_RUN);
    const limitedByRun = Math.max(0, matchedRows.length - relevant.length);
    let created = 0, updated = 0, skipped = 0, agencySkipped = 0, contactDuplicates = 0, contactsCreated = 0, companiesCreated = 0, companiesMatched = 0, missingContact = 0, genericContactSkipped = 0, missingDetail = 0;
    const warnings: string[] = [];
    const allCompanies = await db.select().from(companies).where(eq(companies.ownerId, session.user.id));
    const [settingsRow] = await db.select().from(monitorSettings).where(eq(monitorSettings.ownerId, session.user.id)).orderBy(desc(monitorSettings.updatedAt)).limit(1);
    const blacklist = (settingsRow?.blacklistedCompanies || []).map((x) => normalizeCompanyName(x)).filter(Boolean);
    for (const item of relevant) {
      const externalId = `mpsv:${item.portalId}`;
      const title = normalize(item.pozadovanaProfese?.cs || "IT pozice");
      const companyName = normalize(item.zamestnavatel?.nazev || "Neznámý zaměstnavatel");
      const companyNameKey = normalizeCompanyName(companyName);
      if (companyNameKey && blacklist.some((b) => b.length >= 3 && (companyNameKey.includes(b) || b.includes(companyNameKey)))) {
        agencySkipped++;
        continue;
      }
      const knownCompany = allCompanies.find((company) =>
        sameCompanyIdentity(company, { name: companyName, ico: item.zamestnavatel?.ico || null }).same,
      );
      const company = knownCompany || (await db.insert(companies).values({ name: companyName, ico: item.zamestnavatel?.ico || null, source: "MPSV", ownerId: session.user.id }).returning())[0];
      if (knownCompany) companiesMatched++;
      else {
        companiesCreated++;
        allCompanies.push(company);
      }
      if (knownCompany && !knownCompany.source) await db.update(companies).set({ source: "MPSV", updatedAt: new Date() }).where(eq(companies.id, knownCompany.id));
      const [existing] = await db.select().from(demands).where(and(eq(demands.ownerId, session.user.id), or(eq(demands.externalId, externalId), and(eq(demands.source, "MPSV"), eq(demands.title, title), eq(demands.companyId, company.id))))).limit(1);
      if (existing?.deletedAt) {
        skipped++;
        continue;
      }
      const contactData = contactFrom(item);
      let contactId: string | undefined;
      if (contactData?.email || contactData?.telefon) {
        const contactRules = [];
        if (contactData.email) {
          const email = contactData.email.trim().toLowerCase();
          contactRules.push(or(eq(contacts.email, email), eq(contacts.secondaryEmail, email))!);
        }
        if (contactData.telefon) {
          const phone = contactData.telefon.trim();
          contactRules.push(or(eq(contacts.phone, phone), eq(contacts.secondaryPhone, phone))!);
        }
        const [knownContact] = contactRules.length ? await db.select().from(contacts).where(and(eq(contacts.ownerId, session.user.id), or(...contactRules))).limit(1) : [];
        if (knownContact) { contactId = knownContact.id; contactDuplicates++; }
        else if (contactData.hasNamedPerson) {
          const [name = "Kontakt", ...rest] = contactData.jmeno.trim().split(/\s+/);
          const [createdContact] = await db.insert(contacts).values({ firstName: name, lastName: rest.join(" ") || "MPSV", role: contactData.role || null, email: contactData.email || null, phone: contactData.telefon || null, source: "MPSV", companyId: company.id, ownerId: session.user.id }).returning();
          contactId = createdContact.id;
          contactsCreated++;
        } else {
          genericContactSkipped++;
        }
      } else {
        missingContact++;
      }
      const detail = normalize(item.upresnujiciInformace?.cs);
      if (!detail) missingDetail++;
      const demandText = [detail, salaryText(item)].filter(Boolean).join("\n") || null;
      const values = { title, source: "MPSV", sourceUrl: `https://data.mpsv.cz/od/soubory/volna-mista-prirustek/${latest}`, role: title, location: locationOf(item), demandText, relevanceScore: relevanceFor(`${title} ${demandText || ""}`), technologies: extractTags(`${title} ${demandText || ""}`), companyId: company.id, contactId: contactId || null, ownerId: session.user.id, externalId };
      if (existing) { await db.update(demands).set({ ...values, updatedAt: new Date() }).where(eq(demands.id, existing.id)); updated++; }
      else { await db.insert(demands).values(values); created++; }
    }
    warnings.push(`MPSV soubor ${latest}: celkem ${allRows.length}, IT shoda ${matchedRows.length}, zpracováno ${relevant.length}.`);
    warnings.push(`Firmy: nové ${companiesCreated}, spárované ${companiesMatched}. Kontakty: nové ${contactsCreated}, spárované ${contactDuplicates}.`);
    if (contactDuplicates) warnings.push(`${contactDuplicates} kontaktů spárováno s existující kartou.`);
    if (genericContactSkipped) warnings.push(`${genericContactSkipped} obecných MPSV kontaktů nebylo založeno jako kontaktní karta; zůstávají jen u původního zdroje.`);
    if (missingContact) warnings.push(`${missingContact} zpracovaných MPSV položek nemělo použitelný kontakt.`);
    if (missingDetail) warnings.push(`${missingDetail} zpracovaných MPSV položek nemělo úplný text detailu.`);
    if (limitedByRun) warnings.push(`${limitedByRun} IT shod nebylo zpracováno kvůli limitu jednoho běhu ${MAX_ITEMS_PER_RUN}.`);
    if (skipped) warnings.push(`${skipped} poptávek bylo přeskočeno, protože jsou v koši a znovu se nenačítají.`);
    if (agencySkipped) warnings.push(`${agencySkipped} poptávek bylo přeskočeno, protože zaměstnavatel je na blacklistu personálních agentur.`);
    if (!relevant.length) warnings.push("V aktuálním souboru nebyla nalezena žádná IT shoda podle filtru rolí.");
    const summary = {
      file: latest,
      received: allRows.length,
      matched: matchedRows.length,
      processed: relevant.length,
      created,
      updated,
      skipped,
      agencySkipped,
      limitedByRun,
      companiesCreated,
      companiesMatched,
      contactsCreated,
      contactDuplicates,
      genericContactSkipped,
      missingContact,
      missingDetail,
    };
    await db.update(importRuns).set({ status: warnings.length ? "completed_with_warnings" : "completed", completedAt: new Date(), receivedCount: allRows.length, createdCount: created, updatedCount: updated, skippedCount: skipped + limitedByRun, errorSummary: warnings.length ? JSON.stringify({ summary, warnings }) : null }).where(eq(importRuns.id, run.id));
    await db.update(connectorSources).set({ lastSuccessAt: new Date(), updatedAt: new Date() }).where(eq(connectorSources.id, connector.id));
    return NextResponse.json({ ...summary, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neznámá chyba importu";
    await db.update(importRuns).set({ status: "failed", completedAt: new Date(), errorSummary: message }).where(eq(importRuns.id, run.id));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
