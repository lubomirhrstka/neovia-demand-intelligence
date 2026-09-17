import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { companies, contacts, demands } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

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
    .where(eq(demands.ownerId, session.user.id))
    .orderBy(desc(demands.importedAt));
  return NextResponse.json(rows);
}
