import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import { count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const db = getDb();
  const [{ total }] = await db.select({ total: count() }).from(users);
  if (Number(total) === 1) {
    const [user] = await db.update(users).set({ role: "admin", updatedAt: new Date() }).where(eq(users.id, session.user.id)).returning();
    return NextResponse.json({ role: user.role, firstAdmin: true });
  }
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.user.id)).limit(1);
  return NextResponse.json({ role: user?.role || "sales", firstAdmin: false });
}
