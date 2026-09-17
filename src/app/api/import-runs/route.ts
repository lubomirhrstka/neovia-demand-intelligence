import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { connectorSources, importRuns } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user)
    return NextResponse.json(
      { error: "Nepřihlášený uživatel" },
      { status: 401 },
    );

  const rows = await getDb()
    .select({
      id: importRuns.id,
      sourceName: connectorSources.name,
      sourceKey: connectorSources.key,
      status: importRuns.status,
      startedAt: importRuns.startedAt,
      completedAt: importRuns.completedAt,
      receivedCount: importRuns.receivedCount,
      createdCount: importRuns.createdCount,
      updatedCount: importRuns.updatedCount,
      skippedCount: importRuns.skippedCount,
      errorSummary: importRuns.errorSummary,
    })
    .from(importRuns)
    .leftJoin(connectorSources, eq(importRuns.sourceId, connectorSources.id))
    .where(eq(importRuns.triggeredById, session.user.id))
    .orderBy(desc(importRuns.createdAt))
    .limit(12);

  return NextResponse.json(rows);
}
