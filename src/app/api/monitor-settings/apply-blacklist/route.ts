import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { companyKey } from "@/lib/matching";
import { auditLog, companies, demands, monitorSettings } from "@/lib/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const dryRun = Boolean(body.dryRun);
  const db = getDb();

  const [settingsRow] = await db
    .select()
    .from(monitorSettings)
    .where(eq(monitorSettings.ownerId, session.user.id))
    .orderBy(desc(monitorSettings.updatedAt))
    .limit(1);
  const blacklist = (settingsRow?.blacklistedCompanies || []).map((x) => companyKey(x)).filter(Boolean);
  if (blacklist.length === 0) {
    return NextResponse.json({ matchedCompanies: [], affectedDemands: 0 });
  }

  const allCompanies = await db.select().from(companies).where(eq(companies.ownerId, session.user.id));
  const matchedCompanies = allCompanies.filter((company) => {
    const key = companyKey(company.name);
    return key && blacklist.some((b) => key.includes(b) || b.includes(key));
  });
  if (matchedCompanies.length === 0) {
    return NextResponse.json({ matchedCompanies: [], affectedDemands: 0 });
  }
  const companyIds = matchedCompanies.map((c) => c.id);

  const activeDemands = await db
    .select({ id: demands.id, title: demands.title, companyId: demands.companyId })
    .from(demands)
    .where(and(eq(demands.ownerId, session.user.id), inArray(demands.companyId, companyIds), isNull(demands.deletedAt)));

  if (dryRun) {
    return NextResponse.json({
      matchedCompanies: matchedCompanies.map((c) => c.name),
      affectedDemands: activeDemands.length,
    });
  }

  if (activeDemands.length > 0) {
    await db
      .update(demands)
      .set({
        deletedAt: new Date(),
        deletedById: session.user.id,
        deleteReason: "Firma je na blacklistu personálních agentur",
        updatedAt: new Date(),
      })
      .where(and(eq(demands.ownerId, session.user.id), inArray(demands.id, activeDemands.map((d) => d.id))));

    await db.insert(auditLog).values({
      entityType: "demand",
      entityId: activeDemands[0].id,
      action: "bulk_deleted_agency_blacklist",
      before: { count: activeDemands.length, companies: matchedCompanies.map((c) => c.name) },
      actorId: session.user.id,
    });
  }

  return NextResponse.json({
    matchedCompanies: matchedCompanies.map((c) => c.name),
    affectedDemands: activeDemands.length,
  });
}
