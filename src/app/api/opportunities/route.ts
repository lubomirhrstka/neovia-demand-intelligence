import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sameCompanyIdentity } from "@/lib/matching";
import { companies, contacts, demands, opportunities } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { MISSING_LABELS, missingForStage } from "@/lib/pipeline-rules";
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
      nextStepDueAt: opportunities.nextStepDueAt,
      stageChangedAt: opportunities.stageChangedAt,
      closeReason: opportunities.closeReason,
      pipeline: opportunities.pipeline,
      note: opportunities.note,
      source: opportunities.source,
      companyId: opportunities.companyId,
      contactId: opportunities.contactId,
      demandId: opportunities.demandId,
      updatedAt: opportunities.updatedAt,
      company: companies.name,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      demandTitle: demands.title,
    })
    .from(opportunities)
    .leftJoin(companies, eq(opportunities.companyId, companies.id))
    .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
    .leftJoin(demands, eq(opportunities.demandId, demands.id))
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
  const archiveSourceDemand = async (demandId: string) => {
    await db
      .update(demands)
      .set({
        deletedAt: new Date(),
        deletedById: actor.id,
        deleteReason: "Převedeno do Pipeline",
        updatedAt: new Date(),
      })
      .where(and(eq(demands.id, demandId), eq(demands.ownerId, actor.id)));
  };
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
    if (existing) {
      await archiveSourceDemand(b.demandId);
      return NextResponse.json({ ...existing, alreadyExists: true });
    }
  }
  const existingCompanies = await db
    .select()
    .from(companies)
    .where(eq(companies.ownerId, actor.id));
  const known = existingCompanies.find((company) =>
    sameCompanyIdentity(company, { name: b.company.trim() }).same,
  );
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
        .select({ source: demands.source, contactId: demands.contactId })
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
      contactId: sourceDemand?.contactId || null,
      demandId: b.demandId || null,
      // LinkedIn alerty jsou pracovní nabídky pro mě → pipeline "Moje kariéra"; ostatní zdroje = obchod
      pipeline:
        b.pipeline === "career" || b.pipeline === "sales"
          ? b.pipeline
          : /linkedin/i.test(sourceDemand?.source || sourceTag || "")
            ? "career"
            : "sales",
      nextStep: b.nextStep?.trim() || null,
      nextStepDueAt: b.nextStepDueAt ? new Date(b.nextStepDueAt) : null,
      stageChangedAt: new Date(),
      ownerId: actor.id,
    })
    .returning();
  if (b.demandId) await archiveSourceDemand(b.demandId);
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
  const db = getDb();
  const [current] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, b.id), eq(opportunities.ownerId, actor.id)))
    .limit(1);
  if (!current)
    return NextResponse.json({ error: "Případ nebyl nalezen." }, { status: 404 });
  const stageChanges = Boolean(b.stage && b.stage !== current.stage);
  if (stageChanges) {
    // Pravidla pipeline: do fáze lze případ posunout jen s potřebnými údaji
    const merged = {
      stage: b.stage,
      pipeline: b.pipeline ?? current.pipeline,
      valueCzk: b.valueCzk !== undefined ? Number(b.valueCzk) || null : current.valueCzk,
      nextStep: b.nextStep !== undefined ? b.nextStep : current.nextStep,
      nextStepDueAt: b.nextStepDueAt !== undefined ? b.nextStepDueAt : current.nextStepDueAt,
      closeReason: b.closeReason !== undefined ? b.closeReason : current.closeReason,
    };
    const missing = missingForStage(merged);
    if (missing.length)
      return NextResponse.json(
        {
          error: `Pro tuto fázi doplňte: ${missing.map((m) => MISSING_LABELS[m]).join(", ")}.`,
          missing,
        },
        { status: 422 },
      );
  }
  const values = {
    ...(b.stage ? { stage: b.stage } : {}),
    ...(stageChanges ? { stageChangedAt: new Date() } : {}),
    ...(b.nextStepDueAt !== undefined
      ? { nextStepDueAt: b.nextStepDueAt ? new Date(b.nextStepDueAt) : null }
      : {}),
    ...(b.closeReason !== undefined ? { closeReason: b.closeReason?.trim() || null } : {}),
    ...(b.pipeline === "sales" || b.pipeline === "career" ? { pipeline: b.pipeline } : {}),
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
  const [item] = await db
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
