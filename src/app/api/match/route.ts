import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { demands, capacities } from "@/lib/schema";
import { matchDemandsToCapacities } from "@/lib/matching";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * POST /api/match
 * Matchuje demands s capacities
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { demandId, capacityId, limit = 10, threshold = 30 } = body;

    let demandList;
    if (demandId) {
      demandList = await db.query.demands.findMany({
        where: eq(demands.id, demandId),
      });
    } else {
      demandList = await db.query.demands.findMany({ limit: 100 });
    }

    let capacityList;
    if (capacityId) {
      capacityList = await db.query.capacities.findMany({
        where: eq(capacities.id, capacityId),
      });
    } else {
      capacityList = await db.query.capacities.findMany({ limit: 200 });
    }

    if (demandList.length === 0 || capacityList.length === 0) {
      return NextResponse.json(
        { error: "No demands or capacities found" },
        { status: 404 }
      );
    }

    const matches = matchDemandsToCapacities(demandList, capacityList)
      .map((result) => ({
        demand: result.demand,
        topMatches: result.matches
          .filter((m) => m.score.overall >= threshold)
          .slice(0, limit),
      }))
      .filter((r) => r.topMatches.length > 0);

    return NextResponse.json({
      total: matches.length,
      matches,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Match error:", error);
    return NextResponse.json({ error: "Matching failed" }, { status: 500 });
  }
}

/**
 * GET /api/match?demandId=uuid&capacityId=uuid
 * Vrací score mezi demand a capacity
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const demandId = searchParams.get("demandId");
    const capacityId = searchParams.get("capacityId");

    if (!demandId || !capacityId) {
      return NextResponse.json(
        { error: "Missing demandId or capacityId" },
        { status: 400 }
      );
    }

    const demand = await db.query.demands.findFirst({
      where: eq(demands.id, demandId),
    });

    const capacity = await db.query.capacities.findFirst({
      where: eq(capacities.id, capacityId),
    });

    if (!demand || !capacity) {
      return NextResponse.json(
        { error: "Demand or capacity not found" },
        { status: 404 }
      );
    }

    const { matchDemandToCapacity } = await import("@/lib/matching");
    const score = matchDemandToCapacity(demand, capacity);

    return NextResponse.json({
      demand: {
        id: demand.id,
        title: demand.title,
        role: demand.role,
      },
      capacity: {
        id: capacity.id,
        name: capacity.name,
        role: capacity.role,
      },
      score,
    });
  } catch (error) {
    console.error("Match GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch match" },
      { status: 500 }
    );
  }
}
