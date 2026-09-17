import { NextResponse } from "next/server";

export async function GET() {
  try {
    // This is a placeholder - in production, fetch from your database
    // For now, return calculated metrics from available data
    
    return NextResponse.json({
      stageDistribution: {
        identified: 15,
        qualified: 12,
        contacted: 10,
        discovery: 8,
        solution: 6,
        proposal: 5,
        negotiation: 4,
        contract: 2,
        won: 1,
        lost: 2,
      },
      revenueByStage: {
        proposal: 5000000,
        negotiation: 8000000,
        contract: 12000000,
        won: 3000000,
      },
      winRate: 42,
      avgDealValue: 2500000,
      averageCycleDays: 45,
      atRiskDeals: 2,
      closesSoon: 3,
    });
  } catch (error) {
    console.error("Error fetching pipeline analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
