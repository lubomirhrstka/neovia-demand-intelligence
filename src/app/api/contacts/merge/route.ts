import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activities, auditLog, contacts, demands, opportunities, tasks } from "@/lib/schema";
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
    return NextResponse.json({ error: "Vyberte hlavní kontakt a alespoň jednu duplicitu ke sloučení." }, { status: 400 });
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.ownerId, user.id), inArray(contacts.id, [masterId, ...duplicateIds])));
  const master = rows.find((row) => row.id === masterId);
  const duplicates = rows.filter((row) => duplicateIds.includes(row.id));
  if (!master || duplicates.length !== duplicateIds.length) {
    return NextResponse.json({ error: "Kontaktní kartu se nepodařilo najít." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  const fillable = ["role", "email", "secondaryEmail", "phone", "secondaryPhone"] as const;
  for (const field of fillable) {
    if (!master[field]) {
      const donor = duplicates.find((d) => d[field]);
      if (donor) patch[field] = donor[field];
    }
  }
  if (!master.verified) {
    const verifiedDonor = duplicates.find((d) => d.verified);
    if (verifiedDonor) patch.verified = true;
  }
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date();
    await db.update(contacts).set(patch).where(eq(contacts.id, masterId));
  }
  await db.update(demands).set({ contactId: masterId, updatedAt: new Date() }).where(inArray(demands.contactId, duplicateIds));
  await db.update(opportunities).set({ contactId: masterId, updatedAt: new Date() }).where(inArray(opportunities.contactId, duplicateIds));
  await db.update(tasks).set({ contactId: masterId, updatedAt: new Date() }).where(inArray(tasks.contactId, duplicateIds));
  await db.update(activities).set({ contactId: masterId }).where(inArray(activities.contactId, duplicateIds));

  await db.insert(auditLog).values({
    entityType: "contact",
    entityId: masterId,
    action: "merged",
    before: { duplicates: duplicates.map((d) => ({ id: d.id, name: `${d.firstName} ${d.lastName}` })) },
    after: { ...master, ...patch },
    actorId: user.id,
  });

  await db.delete(contacts).where(and(eq(contacts.ownerId, user.id), inArray(contacts.id, duplicateIds)));

  const [merged] = await db.select().from(contacts).where(eq(contacts.id, masterId)).limit(1);
  return NextResponse.json({ ok: true, contact: merged, mergedCount: duplicates.length });
}
