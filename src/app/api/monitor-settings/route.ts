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
    "Security Officer",
    "NIS2",
    "GDPR",
    "Incident Response",
    "SOC Manager",
    "Information Security",
  ],
  locations: ["Praha", "Ostrava", "Brno", "remote", "hybrid"],
  excludedKeywords: ["junior", "trainee", "internship", "unpaid"],
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
