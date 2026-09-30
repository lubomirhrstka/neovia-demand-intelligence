import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { verifyCompanyWeb } from "@/lib/company-web-verify";
import { companies, demands } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const [row] = await db
    .select({ demand: demands, company: companies })
    .from(demands)
    .leftJoin(companies, eq(demands.companyId, companies.id))
    .where(and(eq(demands.id, id), eq(demands.ownerId, session.user.id)))
    .limit(1);

  if (!row?.demand) return NextResponse.json({ error: "Poptávka nebyla nalezena." }, { status: 404 });
  if (!row.company) return NextResponse.json({ error: "Poptávka nemá navázanou firmu." }, { status: 409 });

  const result = await verifyCompanyWeb({
    ownerId: session.user.id,
    companyId: row.company.id,
    companyName: row.company.name,
    companyWebsite: row.company.website,
    companyNote: row.company.note,
    demandTitle: row.demand.title,
    demandText: row.demand.demandText,
    demandSourceUrl: row.demand.sourceUrl,
  });
  if (!result) return NextResponse.json({ error: "Nemám z čeho odvodit firemní web." }, { status: 409 });

  return NextResponse.json({ ok: true, ...result });
}
