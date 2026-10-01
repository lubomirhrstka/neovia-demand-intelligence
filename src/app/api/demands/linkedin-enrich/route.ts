import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sameCompanyIdentity } from "@/lib/matching";
import {
  cleanLinkedInLocation,
  enrichLinkedInJob,
  extractLinkedInJobId,
  isPlausibleCompany,
  mergeWorkMode,
  type LinkedInJobMeta,
} from "@/lib/linkedin-job-enrich";
import { companies, demands } from "@/lib/schema";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type Db = ReturnType<typeof getDb>;
type DemandRow = typeof demands.$inferSelect;
type CompanyRow = typeof companies.$inferSelect;

const PLACEHOLDER = /neuvedena|unknown|neznám/i;

/** Pouze LinkedIn poptávky — regex na job ID by jinak chytil i 8místná MPSV ID. */
const isLinkedInDemand = (d: DemandRow) =>
  /linkedin/i.test(d.source || "") || (d.externalId || "").startsWith("linkedin:");

/**
 * Aplikuje ověřená metadata z LinkedIn stránky na poptávku.
 * Firmu NIKDY nepřejmenovává (placeholder je sdílený více poptávkami) —
 * dohledá existující firmu se stejnou identitou, případně vytvoří novou, a poptávku na ni přepojí.
 */
async function applyMeta(db: Db, ownerId: string, demand: DemandRow, meta: LinkedInJobMeta, allCompanies: CompanyRow[]) {
  const verifiedLoc = cleanLinkedInLocation(meta.location);
  const location = verifiedLoc ? mergeWorkMode(verifiedLoc, demand.location) : cleanLinkedInLocation(demand.location);
  let companyId = demand.companyId;
  let companyName: string | null = null;

  if (isPlausibleCompany(meta.company)) {
    companyName = meta.company.trim();
    let match = allCompanies.find((c) => !PLACEHOLDER.test(c.name || "") && sameCompanyIdentity(c, { name: companyName! }).same);
    if (!match) {
      const [created] = await db
        .insert(companies)
        .values({ name: companyName, source: "LinkedIn", ownerId })
        .returning();
      match = created;
      allCompanies.push(created);
    }
    companyId = match.id;
  }

  // Generovaný stub textu ("Pozice — Firma …") přepíšeme; skutečné znění inzerce nikdy.
  const text = demand.demandText || "";
  const isStubText =
    !text ||
    /Firma neuvedena/i.test(text) ||
    (text.length < 260 && text.startsWith(demand.title) && text.includes(" — "));
  const demandText = isStubText
    ? `${meta.title} — ${companyName || "Firma neuvedena (LinkedIn)"}${location ? ` · ${location}` : ""}`
    : demand.demandText;

  await db
    .update(demands)
    .set({ title: meta.title, role: meta.title, location: location || null, companyId, demandText })
    .where(eq(demands.id, demand.id));

  return { demandId: demand.id, title: meta.title, company: companyName || "", location };
}

/**
 * POST { demandId?: string, limit?: number }
 * - s demandId: ověří jednu poptávku proti veřejné LinkedIn stránce pozice
 * - bez demandId: projde až `limit` LinkedIn poptávek, nejdřív ty bez firmy / s rozbitými daty
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const db = getDb();
  const ownerId = session.user.id;
  const allCompanies = await db.select().from(companies).where(eq(companies.ownerId, ownerId));

  if (body.demandId) {
    const [demand] = await db
      .select()
      .from(demands)
      .where(and(eq(demands.id, String(body.demandId)), eq(demands.ownerId, ownerId)))
      .limit(1);
    if (!demand) return NextResponse.json({ error: "Poptávka nenalezena." }, { status: 404 });
    if (!isLinkedInDemand(demand)) return NextResponse.json({ error: "Nejde o LinkedIn poptávku." }, { status: 400 });

    const id = extractLinkedInJobId(demand.sourceUrl || demand.externalId || "");
    if (!id) return NextResponse.json({ error: "Poptávka nemá LinkedIn job ID / URL." }, { status: 400 });

    const meta = await enrichLinkedInJob(id);
    if (!meta) {
      return NextResponse.json(
        { error: "Veřejná stránka pozice není dostupná (nabídka mohla být stažena)." },
        { status: 502 },
      );
    }
    const result = await applyMeta(db, ownerId, demand, meta, allCompanies);
    return NextResponse.json({ ok: true, ...result, source: meta.source });
  }

  const limit = Math.min(30, Math.max(1, Number(body.limit) || 15));
  const rows = await db.select().from(demands).where(and(eq(demands.ownerId, ownerId), isNull(demands.deletedAt)));
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  const needsFix = (d: DemandRow) => {
    const c = d.companyId ? companyById.get(d.companyId) : null;
    return !c || PLACEHOLDER.test(c.name || "") || !isPlausibleCompany(c.name);
  };
  const candidates = rows
    .filter(isLinkedInDemand)
    .filter((d) => Boolean(extractLinkedInJobId(d.sourceUrl || d.externalId || "")))
    .sort((a, b) => Number(needsFix(b)) - Number(needsFix(a)))
    .slice(0, limit);

  let enriched = 0;
  let unavailable = 0;
  const results: Awaited<ReturnType<typeof applyMeta>>[] = [];
  for (const demand of candidates) {
    const id = extractLinkedInJobId(demand.sourceUrl || demand.externalId || "");
    if (!id) continue;
    try {
      const meta = await enrichLinkedInJob(id);
      if (!meta) {
        unavailable += 1;
        continue;
      }
      results.push(await applyMeta(db, ownerId, demand, meta, allCompanies));
      enriched += 1;
    } catch {
      /* skip */
    }
  }

  return NextResponse.json({ ok: true, enriched, unavailable, total: candidates.length, results });
}
