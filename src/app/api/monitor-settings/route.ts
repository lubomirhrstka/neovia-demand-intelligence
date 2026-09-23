import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { monitorSettings } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
const defaults = {
  keywords: [
    "IT Security",
    "Cybersecurity",
    "Kybernetická bezpečnost",
    "Kyberbezpečnost",
    "Security Officer",
    "NIS2",
    "Zákon o kybernetické bezpečnosti",
    "Manažer kybernetické bezpečnosti",
    "MKB",
    "Architekt kybernetické bezpečnosti",
    "AKB",
    "Auditor kybernetické bezpečnosti",
    "Security Manager",
    "Security Architect",
    "Security Auditor",
    "CISO",
    "ISMS",
    "GDPR",
    "DORA",
    "ISO 27001",
    "Incident Response",
    "SOC Manager",
    "Information Security",
  ],
  locations: ["Praha", "Ostrava", "Brno", "remote", "hybrid"],
  excludedKeywords: ["junior", "trainee", "internship", "unpaid"],
  blacklistedCompanies: [
    "ManpowerGroup",
    "Adecco",
    "Randstad",
    "Hays",
    "Grafton Recruitment",
    "Trenkwalder",
    "Michael Page",
    "Robert Half",
    "Gi Group",
    "Index Nosluš",
    "Advantage Consulting",
    "CPL Jobs",
    "Synergie",
    "DEKRA Personal",
    "Work Service",
    "McRoy Group",
    "Approach People Recruitment",
    "Alma Career",
    "ProHuman",
  ],
  minimumSalary: 80000,
  schedules: [
    { name: "Job Monitor, ranní kontrola", cron: "30 6 * * 1-5", enabled: true },
    { name: "Job Monitor, odpolední kontrola", cron: "0 13 * * 2,4", enabled: true },
  ],
  exports: ["CSV", "JSON", "XLSX", "PDF"],
};
async function actor() {
  return (await auth.api.getSession({ headers: await headers() }))?.user;
}
export async function GET() {
  const user = await actor();
  if (!user)
    return NextResponse.json(
      { error: "Nepřihlášený uživatel" },
      { status: 401 },
    );
  const [row] = await getDb()
    .select()
    .from(monitorSettings)
    .where(eq(monitorSettings.ownerId, user.id))
    .orderBy(desc(monitorSettings.updatedAt))
    .limit(1);
  if (row && (!row.blacklistedCompanies || row.blacklistedCompanies.length === 0)) {
    return NextResponse.json({ ...row, blacklistedCompanies: defaults.blacklistedCompanies });
  }
  return NextResponse.json(row || defaults);
}
export async function PUT(req: Request) {
  const user = await actor();
  if (!user)
    return NextResponse.json(
      { error: "Nepřihlášený uživatel" },
      { status: 401 },
    );
  const body = await req.json();
  const value = {
    keywords: body.keywords || [],
    locations: body.locations || [],
    excludedKeywords: body.excludedKeywords || [],
    blacklistedCompanies: body.blacklistedCompanies || [],
    minimumSalary: Number(body.minimumSalary || 0),
    schedules: body.schedules || [],
    exports: body.exports || [],
    updatedAt: new Date(),
  };
  const [existing] = await getDb()
    .select({ id: monitorSettings.id })
    .from(monitorSettings)
    .where(eq(monitorSettings.ownerId, user.id))
    .limit(1);
  const [saved] = existing
    ? await getDb()
        .update(monitorSettings)
        .set(value)
        .where(eq(monitorSettings.id, existing.id))
        .returning()
    : await getDb()
        .insert(monitorSettings)
        .values({ ...value, ownerId: user.id })
        .returning();
  return NextResponse.json(saved);
}
