import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { normalizeCompanyName } from "@/lib/matching";
import { auditLog, companies, contacts } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const ARES_SEARCH_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat";
const MAX_BATCH = 35;

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "seznam.cz",
  "email.cz",
  "post.cz",
  "volny.cz",
  "centrum.cz",
  "atlas.cz",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user;
}

const normalizeIco = (value: unknown) => String(value || "").replace(/\D/g, "").padStart(8, "0").slice(-8);

const emailDomain = (value: unknown) => {
  const email = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/)?.[1] || "";
  const domain = email.replace(/^www\./, "");
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return "";
  return domain;
};

const scoreAresMatch = (companyName: string, aresName: string) => {
  const left = normalizeCompanyName(companyName);
  const right = normalizeCompanyName(aresName);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.length >= 6 && right.includes(left)) return 88;
  if (right.length >= 6 && left.includes(right)) return 82;
  const leftWords = new Set(left.split(/\s+/).filter((word) => word.length > 2));
  const rightWords = new Set(right.split(/\s+/).filter((word) => word.length > 2));
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  const total = new Set([...leftWords, ...rightWords]).size || 1;
  return Math.round((shared / total) * 75);
};

async function lookupIcoByName(name: string) {
  const response = await fetch(ARES_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ obchodniJmeno: name, pocet: 8 }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const rows = Array.isArray(data?.ekonomickeSubjekty) ? data.ekonomickeSubjekty : [];
  const best = rows
    .map((row: any) => ({
      ico: normalizeIco(row.ico),
      name: String(row.obchodniJmeno || ""),
      score: scoreAresMatch(name, String(row.obchodniJmeno || "")),
    }))
    .filter((row: { ico: string; score: number }) => row.ico.length === 8 && row.score >= 82)
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)[0];
  return best || null;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const db = getDb();
  const allCompanies = await db.select().from(companies).where(eq(companies.ownerId, user.id));
  const companyRows = body.id
    ? allCompanies.filter((company) => company.id === body.id)
    : allCompanies
        .filter((company) => !company.ico || !company.website)
        .slice(0, MAX_BATCH);

  const contactRows = await db
    .select({
      companyId: contacts.companyId,
      email: contacts.email,
      secondaryEmail: contacts.secondaryEmail,
    })
    .from(contacts)
    .where(eq(contacts.ownerId, user.id));

  let enriched = 0;
  let icoAdded = 0;
  let websiteAdded = 0;
  const details: Array<{ id: string; name: string; ico?: string; website?: string; aresName?: string }> = [];

  for (const company of companyRows) {
    const patch: { ico?: string; website?: string; updatedAt?: Date } = {};
    let aresName = "";

    if (!company.ico) {
      const match = await lookupIcoByName(company.name);
      if (match) {
        patch.ico = match.ico;
        aresName = match.name;
      }
    }

    if (!company.website) {
      const domainCounts = new Map<string, number>();
      for (const contact of contactRows) {
        if (contact.companyId !== company.id) continue;
        for (const candidate of [contact.email, contact.secondaryEmail]) {
          const domain = emailDomain(candidate);
          if (domain) domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
        }
      }
      const domain = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (domain) patch.website = `https://${domain}`;
    }

    if (!patch.ico && !patch.website) continue;

    patch.updatedAt = new Date();
    const [updated] = await db
      .update(companies)
      .set(patch)
      .where(and(eq(companies.id, company.id), eq(companies.ownerId, user.id)))
      .returning();
    await db.insert(auditLog).values({
      entityType: "company",
      entityId: company.id,
      action: "enriched",
      before: company,
      after: updated,
      actorId: user.id,
    });
    enriched += 1;
    if (patch.ico) icoAdded += 1;
    if (patch.website) websiteAdded += 1;
    details.push({
      id: company.id,
      name: company.name,
      ico: patch.ico || undefined,
      website: patch.website || undefined,
      aresName: aresName || undefined,
    });
  }

  return NextResponse.json({
    processed: companyRows.length,
    enriched,
    icoAdded,
    websiteAdded,
    details,
    limited: !body.id && allCompanies.filter((company) => !company.ico || !company.website).length > MAX_BATCH,
  });
}
