import { NextRequest, NextResponse } from "next/server";

import {
  buildBalanceEquityCurve,
  buildUnitDrawdownCurve,
  filterBySince,
  getAccountBundle,
  getSinceDate,
  parseTimeframe,
  serializeAccountBundle,
  getPrimaryDrawdownPercent,
} from "@/lib/trading/account-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const bundle = await getAccountBundle(params.id);
    if (!bundle) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { latestReport } = bundle;
    if (!latestReport) {
      return NextResponse.json({ error: "No report data for this account" }, { status: 404 });
    }

    const timeframe = parseTimeframe(request.nextUrl.searchParams.get("timeframe"));
    const reportTime = latestReport.reportDate ? new Date(latestReport.reportDate) : new Date();
    const since = getSinceDate(timeframe, reportTime);
    const filteredDeals = filterBySince(latestReport.dealLedger, (deal) => deal.time, since);
    const sortedDeals = [...filteredDeals].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
    const equityCurve = buildBalanceEquityCurve(sortedDeals, latestReport.openPositions);
    const unitDrawdownCurve = buildUnitDrawdownCurve(filteredDeals, latestReport.openPositions);

    const curve = equityCurve.map((point) => ({
      x: point.time instanceof Date ? point.time.toISOString() : new Date(point.time).toISOString(),
      equity: point.equity,
      balance: point.balance,
      eventType: point.eventType ?? null,
      eventDelta: point.eventDelta ?? null,
    }));

    const account = serializeAccountBundle(bundle);
    if (!account) {
      return NextResponse.json({ error: "Failed to serialize account" }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        absoluteDrawdown: latestReport.reportResults?.balanceDrawdownAbsolute ?? null,
        relativeDrawdownPct: latestReport.reportResults?.balanceDrawdownRelativePct ?? null,
        maximalDrawdownAmount: latestReport.reportResults?.balanceDrawdownMaximal ?? null,
        maximalDrawdownPct: latestReport.reportResults?.balanceDrawdownMaximalPct ?? getPrimaryDrawdownPercent(latestReport.reportResults ?? null),
        maximalDepositLoad: null,
      },
      equityCurve: curve,
      drawdownCurve: unitDrawdownCurve.map((point) => ({
        x: point.time instanceof Date ? point.time.toISOString() : new Date(point.time).toISOString(),
        y: point.drawdownPercent,
      })),
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch equity detail" }, { status: 500 });
  }
}
