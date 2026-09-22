import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { companies, contacts, demands } from "@/lib/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const realItSignals = [
  " it ",
  " ict ",
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
  "cyber",
  "security",
  "bezpečnost",
  "nis2",
  "isms",
  "iso 27001",
  "sap",
  "linux",
  "aws",
  "azure",
  "kubernetes",
  "tester",
  "qa",
  "databáz",
  "network",
  "síť",
];
const hasRealItSignal = (row: { source: string; title: string; role: string | null; demandText: string | null; technologies: string[] | null }) => {
  if (row.source !== "MPSV") return true;
  const text = ` ${(row.title || "")} ${(row.role || "")} ${(row.demandText || "")} ${(row.technologies || []).join(" ")} `.toLowerCase();
  return realItSignals.some((signal) => text.includes(signal));
};

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const rows = await getDb().select({
    id: demands.id, externalId: demands.externalId, title: demands.title, source: demands.source,
    role: demands.role, technologies: demands.technologies, location: demands.location,
    relevanceScore: demands.relevanceScore, importedAt: demands.importedAt, demandText: demands.demandText,
    sourceUrl: demands.sourceUrl, workMode: demands.workMode,
    companyId: companies.id, company: companies.name, companySource: companies.source,
    contactId: contacts.id, contactFirstName: contacts.firstName, contactLastName: contacts.lastName,
    contactRole: contacts.role, contactEmail: contacts.email, contactPhone: contacts.phone, contactSource: contacts.source,
  }).from(demands)
    .leftJoin(companies, eq(demands.companyId, companies.id))
    .leftJoin(contacts, eq(demands.contactId, contacts.id))
    .where(and(eq(demands.ownerId, session.user.id), isNull(demands.deletedAt)))
    .orderBy(desc(demands.importedAt));
  return NextResponse.json(rows.filter(hasRealItSignal));
}

export async function DELETE(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "Chybí ID poptávky." }, { status: 400 });
  const [item] = await getDb()
    .update(demands)
    .set({
      deletedAt: new Date(),
      deletedById: session.user.id,
      deleteReason: body.reason || "Nerelevantní poptávka",
      updatedAt: new Date(),
    })
    .where(and(eq(demands.id, body.id), eq(demands.ownerId, session.user.id)))
    .returning();
  if (!item) return NextResponse.json({ error: "Poptávka nebyla nalezena." }, { status: 404 });
  return NextResponse.json({ ok: true, id: item.id });
}
