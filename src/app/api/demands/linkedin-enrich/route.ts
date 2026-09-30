import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { enrichLinkedInJob, extractLinkedInJobId } from "@/lib/linkedin-job-enrich";
import { companies, demands } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * POST { demandId?: string, sourceUrl?: string, limit?: number }
 * - s demandId: obohatí jednu poptávku z její sourceUrl / externalId
 * - bez demandId: projde až `limit` LinkedIn poptávek s URL a doplní metadata
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const db = getDb();
  const ownerId = session.user.id;

  if (body.demandId) {
    const [demand] = await db
      .select()
      .from(demands)
      .where(and(eq(demands.id, String(body.demandId)), eq(demands.ownerId, ownerId)))
      .limit(1);
    if (!demand) return NextResponse.json({ error: "Poptávka nenalezena." }, { status: 404 });

    const id = extractLinkedInJobId(demand.sourceUrl || demand.externalId || "");
    if (!id) return NextResponse.json({ error: "Poptávka nemá LinkedIn job ID / URL." }, { status: 400 });

    const meta = await enrichLinkedInJob(id);
    if (!meta) return NextResponse.json({ error: "LinkedIn metadata se nepodařilo načíst." }, { status: 502 });

    await db
      .update(demands)
      .set({
        title: meta.title,
        role: meta.title,
        location: meta.location || demand.location,
        demandText: demand.demandText || `${meta.title} — ${meta.company}${meta.location ? ` · ${meta.location}` : ""}`,
      })
      .where(eq(demands.id, demand.id));

    if (demand.companyId && meta.company) {
      const [company] = await db.select().from(companies).where(eq(companies.id, demand.companyId)).limit(1);
      if (company && /neuvedena|unknown|neznám/i.test(company.name || "")) {
        await db.update(companies).set({ name: meta.company }).where(eq(companies.id, company.id));
      }
    }

    return NextResponse.json({
      ok: true,
      demandId: demand.id,
      title: meta.title,
      company: meta.company,
      location: meta.location,
      source: meta.source,
    });
  }

  const limit = Math.min(30, Math.max(1, Number(body.limit) || 10));
  const rows = await db.select().from(demands).where(eq(demands.ownerId, ownerId));
  const candidates = rows
    .filter((d) => Boolean(extractLinkedInJobId(d.sourceUrl || d.externalId || "")))
    .slice(0, limit);

  let enriched = 0;
  const results: { demandId: string; title: string; company: string; location: string }[] = [];

  for (const demand of candidates) {
    const id = extractLinkedInJobId(demand.sourceUrl || demand.externalId || "");
    if (!id) continue;
    try {
      const meta = await enrichLinkedInJob(id);
      if (!meta) continue;
      await db
        .update(demands)
        .set({
          title: meta.title,
          role: meta.title,
          location: meta.location || demand.location,
        })
        .where(eq(demands.id, demand.id));
      enriched += 1;
      results.push({ demandId: demand.id, title: meta.title, company: meta.company, location: meta.location });
    } catch {
      /* skip */
    }
  }

  return NextResponse.json({ ok: true, enriched, total: candidates.length, results });
}
