import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { companies, connectorSources, contacts, demands, importRuns, users } from "@/lib/schema";
import { and, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const INDEX_URL = "https://data.mpsv.cz/od/soubory/volna-mista-prirustek/";
const IT_ROLE_PATTERN = /\b(it|ict|software|developer|vývojář|programátor|java|\.net|python|devops|cloud|kyber|cyber|security|bezpečnost|síť|network|data engineer|databáz|sap|linux|aws|azure|kubernetes|tester|qa)\b/i;
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
  mistoVykonuPrace?: { pracoviste?: { email?: string | null; telefon?: string | null }[] };
  prvniKontaktSeZamestnavatelem?: { komuSeHlasit?: { email?: string | null; telefon?: string | null; jmeno?: string | null } };
};

function locationOf(item: MpsvItem) { return item.mistoVykonuPrace?.pracoviste?.[0]?.email ? "ČR" : "ČR"; }
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const extractTags = (text: string) =>
  TAG_KEYWORDS.filter((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase()),
  ).slice(0, 12);

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
    const relevant = (payload.polozky || []).filter(item => IT_ROLE_PATTERN.test(item.pozadovanaProfese?.cs || "")).slice(0, MAX_ITEMS_PER_RUN);
    let created = 0, updated = 0, skipped = 0, contactDuplicates = 0;
    const warnings: string[] = [];
    for (const item of relevant) {
      const externalId = `mpsv:${item.portalId}`;
      const title = normalize(item.pozadovanaProfese?.cs || "IT pozice");
      const companyName = normalize(item.zamestnavatel?.nazev || "Neznámý zaměstnavatel");
      const [knownCompany] = await db.select().from(companies).where(and(eq(companies.name, companyName), eq(companies.ownerId, session.user.id))).limit(1);
      const company = knownCompany || (await db.insert(companies).values({ name: companyName, ico: item.zamestnavatel?.ico || null, source: "MPSV", ownerId: session.user.id }).returning())[0];
      if (knownCompany && !knownCompany.source) await db.update(companies).set({ source: "MPSV", updatedAt: new Date() }).where(eq(companies.id, knownCompany.id));
      const [existing] = await db.select().from(demands).where(and(eq(demands.ownerId, session.user.id), or(eq(demands.externalId, externalId), and(eq(demands.source, "MPSV"), eq(demands.title, title), eq(demands.companyId, company.id))))).limit(1);
      const contactData = item.prvniKontaktSeZamestnavatelem?.komuSeHlasit;
      let contactId: string | undefined;
      if (contactData?.email || contactData?.telefon) {
        const contactRules = [];
        if (contactData.email) contactRules.push(eq(contacts.email, contactData.email.trim().toLowerCase()));
        if (contactData.telefon) contactRules.push(eq(contacts.phone, contactData.telefon.trim()));
        const [knownContact] = contactRules.length ? await db.select().from(contacts).where(and(eq(contacts.ownerId, session.user.id), or(...contactRules))).limit(1) : [];
        if (knownContact) { contactId = knownContact.id; contactDuplicates++; }
        else { const [name = "Kontakt", ...rest] = (contactData.jmeno || "Kontakt MPSV").trim().split(/\s+/); const [createdContact] = await db.insert(contacts).values({ firstName: name, lastName: rest.join(" ") || "MPSV", email: contactData.email, phone: contactData.telefon || null, source: "MPSV", companyId: company.id, ownerId: session.user.id }).returning(); contactId = createdContact.id; }
      }
      const demandText = item.upresnujiciInformace?.cs || null;
      const values = { title, source: "MPSV", sourceUrl: `https://data.mpsv.cz/od/soubory/volna-mista-prirustek/${latest}`, role: title, location: locationOf(item), demandText, technologies: extractTags(`${title} ${demandText || ""}`), companyId: company.id, contactId: contactId || null, ownerId: session.user.id, externalId };
      if (existing) { await db.update(demands).set({ ...values, updatedAt: new Date() }).where(eq(demands.id, existing.id)); updated++; }
      else { await db.insert(demands).values(values); created++; }
    }
    if (contactDuplicates) warnings.push(`${contactDuplicates} kontaktů spárováno s existující kartou.`);
    if (!relevant.length) warnings.push("V aktuálním souboru nebyla nalezena žádná IT shoda podle filtru rolí.");
    await db.update(importRuns).set({ status: warnings.length ? "completed_with_warnings" : "completed", completedAt: new Date(), receivedCount: payload.polozky?.length || 0, createdCount: created, updatedCount: updated, skippedCount: skipped, errorSummary: warnings.length ? JSON.stringify({ warnings }) : null }).where(eq(importRuns.id, run.id));
    await db.update(connectorSources).set({ lastSuccessAt: new Date(), updatedAt: new Date() }).where(eq(connectorSources.id, connector.id));
    return NextResponse.json({ file: latest, received: payload.polozky?.length || 0, matched: relevant.length, created, updated, skipped, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neznámá chyba importu";
    await db.update(importRuns).set({ status: "failed", completedAt: new Date(), errorSummary: message }).where(eq(importRuns.id, run.id));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
