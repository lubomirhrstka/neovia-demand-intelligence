import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activities, auditLog, companies, contacts, demands, opportunities, tasks } from "@/lib/schema";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await request.json();
  const masterId: string | undefined = body.masterId;
  const duplicateIds: string[] = Array.isArray(body.duplicateIds)
    ? body.duplicateIds.filter((id: string) => id && id !== masterId)
    : [];
  if (!masterId || duplicateIds.length === 0) {
    return NextResponse.json({ error: "Vyberte hlavní firmu a alespoň jednu duplicitu ke sloučení." }, { status: 400 });
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(companies)
    .where(and(eq(companies.ownerId, user.id), inArray(companies.id, [masterId, ...duplicateIds])));
  const master = rows.find((row) => row.id === masterId);
  const duplicates = rows.filter((row) => duplicateIds.includes(row.id));
  if (!master || duplicates.length !== duplicateIds.length) {
    return NextResponse.json({ error: "Firemní kartu se nepodařilo najít." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  const fillable = [
    "ico", "website", "sector", "priority", "size",
    "relationshipStatus", "ownerName", "decisionMaker", "nextStep", "note",
  ] as const;
  for (const field of fillable) {
    if (!master[field]) {
      const donor = duplicates.find((d) => d[field]);
      if (donor) patch[field] = donor[field];
    }
  }
  if (!master.nextStepDueAt) {
    const donor = duplicates.find((d) => d.nextStepDueAt);
    if (donor) patch.nextStepDueAt = donor.nextStepDueAt;
  }
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date();
    await db.update(companies).set(patch).where(eq(companies.id, masterId));
  }
  await db.update(contacts).set({ companyId: masterId, updatedAt: new Date() }).where(inArray(contacts.companyId, duplicateIds));
  await db.update(demands).set({ companyId: masterId, updatedAt: new Date() }).where(inArray(demands.companyId, duplicateIds));
  await db.update(opportunities).set({ companyId: masterId, updatedAt: new Date() }).where(inArray(opportunities.companyId, duplicateIds));
  await db.update(tasks).set({ companyId: masterId, updatedAt: new Date() }).where(inArray(tasks.companyId, duplicateIds));
  await db.update(activities).set({ companyId: masterId }).where(inArray(activities.companyId, duplicateIds));

  await db.insert(auditLog).values({
    entityType: "company",
    entityId: masterId,
    action: "merged",
    before: { duplicates: duplicates.map((d) => ({ id: d.id, name: d.name })) },
    after: { ...master, ...patch },
    actorId: user.id,
  });

  await db.delete(companies).where(and(eq(companies.ownerId, user.id), inArray(companies.id, duplicateIds)));

  const [merged] = await db.select().from(companies).where(eq(companies.id, masterId)).limit(1);
  return NextResponse.json({ ok: true, company: merged, mergedCount: duplicates.length });
}
