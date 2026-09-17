import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { companies, demands, opportunities } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
async function user() {
  return (await auth.api.getSession({ headers: await headers() }))?.user;
}
export async function GET() {
  const actor = await user();
  if (!actor)
    return NextResponse.json(
      { error: "Nepřihlášený uživatel" },
      { status: 401 },
    );
  const rows = await getDb()
    .select({
      id: opportunities.id,
      title: opportunities.title,
      stage: opportunities.stage,
      valueCzk: opportunities.valueCzk,
      probability: opportunities.probability,
      expectedCloseDate: opportunities.expectedCloseDate,
      nextStep: opportunities.nextStep,
      note: opportunities.note,
      source: opportunities.source,
      company: companies.name,
    })
    .from(opportunities)
    .leftJoin(companies, eq(opportunities.companyId, companies.id))
    .where(eq(opportunities.ownerId, actor.id))
    .orderBy(desc(opportunities.updatedAt));
  return NextResponse.json(rows);
}
export async function POST(req: Request) {
  const actor = await user();
  if (!actor)
    return NextResponse.json(
      { error: "Nepřihlášený uživatel" },
      { status: 401 },
    );
  const b = await req.json();
  if (!b.title?.trim() || !b.company?.trim())
    return NextResponse.json(
      { error: "Doplňte název případu a firmu." },
      { status: 400 },
    );
  const db = getDb();
  if (b.demandId) {
    const [existing] = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.ownerId, actor.id),
          eq(opportunities.demandId, b.demandId),
        ),
      )
      .limit(1);
    if (existing)
      return NextResponse.json({ ...existing, alreadyExists: true });
  }
  const [known] = await db
    .select()
    .from(companies)
    .where(eq(companies.name, b.company.trim()))
    .limit(1);
  const sourceTag = b.source?.trim() || null;
  const company =
    known ||
    (
      await db
        .insert(companies)
        .values({ name: b.company.trim(), source: sourceTag || "Ručně", ownerId: actor.id })
        .returning()
    )[0];
  if (known && sourceTag && !known.source) {
    await db
      .update(companies)
      .set({ source: sourceTag, updatedAt: new Date() })
      .where(eq(companies.id, known.id));
  }
  const [sourceDemand] = b.demandId
    ? await db
        .select({ source: demands.source })
        .from(demands)
        .where(and(eq(demands.id, b.demandId), eq(demands.ownerId, actor.id)))
        .limit(1)
    : [];
  const [item] = await db
    .insert(opportunities)
    .values({
      title: b.title.trim(),
      stage: b.stage || "identified",
      valueCzk: Number(b.valueCzk || 0) || null,
      probability: Number(b.probability || 0),
      source: sourceTag || sourceDemand?.source || "Ručně",
      companyId: company.id,
      demandId: b.demandId || null,
      ownerId: actor.id,
    })
    .returning();
  return NextResponse.json(item, { status: 201 });
}
export async function PATCH(req: Request) {
  const actor = await user();
  if (!actor)
    return NextResponse.json(
      { error: "Nepřihlášený uživatel" },
      { status: 401 },
    );
  const b = await req.json();
  const allowed = [
    "identified",
    "qualified",
    "contacted",
    "discovery",
    "solution",
    "proposal",
    "negotiation",
    "contract",
    "won",
    "lost",
  ];
  if (!b.id || (b.stage && !allowed.includes(b.stage)))
    return NextResponse.json(
      { error: "Neplatná fáze pipeline." },
      { status: 400 },
    );
  const values = {
    ...(b.stage ? { stage: b.stage } : {}),
    ...(b.valueCzk !== undefined
      ? { valueCzk: Number(b.valueCzk) || null }
      : {}),
    ...(b.probability !== undefined
      ? { probability: Number(b.probability) || 0 }
      : {}),
    ...(b.expectedCloseDate !== undefined
      ? {
          expectedCloseDate: b.expectedCloseDate
            ? new Date(b.expectedCloseDate)
            : null,
        }
      : {}),
    ...(b.nextStep !== undefined ? { nextStep: b.nextStep || null } : {}),
    ...(b.note !== undefined ? { note: b.note || null } : {}),
    ...(b.source !== undefined ? { source: b.source || null } : {}),
    updatedAt: new Date(),
  };
  const [item] = await getDb()
    .update(opportunities)
    .set(values)
    .where(and(eq(opportunities.id, b.id), eq(opportunities.ownerId, actor.id)))
    .returning();
  if (!item)
    return NextResponse.json(
      { error: "Případ nebyl nalezen." },
      { status: 404 },
    );
  return NextResponse.json(item);
}
