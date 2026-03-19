import { NextRequest, NextResponse } from "next/server";

import {
  buildBalanceEquityCurve,
  buildUnitDrawdownCurve,
  computeStreaks,
  filterBySince,
  getAccountBundle,
  getSinceDate,
  dealNet,
  isTradingDeal,
  parseTimeframe,
  serializeAccountBundle,
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
    const tradeNetSeries = sortedDeals.filter((deal) => isTradingDeal(deal.type)).map((deal) => dealNet(deal));
    const streaks = computeStreaks(tradeNetSeries);

    const curve = equityCurve.map((point, index) => {
      const deal = sortedDeals[index] ?? null;
      return {
        x: point.time instanceof Date ? point.time.toISOString() : new Date(point.time).toISOString(),
        equity: point.equity,
        balance: point.balance,
        eventType: deal?.type ?? null,
        eventDelta: deal ? dealNet(deal) : null,
      };
    });

    let peakEquity = 0;
    let minEquity = 0;
    if (curve.length) {
      peakEquity = curve[0].equity;
      minEquity = curve[0].equity;
    }

    for (const point of curve) {
      peakEquity = Math.max(peakEquity, point.equity);
      minEquity = Math.min(minEquity, point.equity);
    }

    const account = serializeAccountBundle(bundle);
    if (!account) {
      return NextResponse.json({ error: "Failed to serialize account" }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        points: curve.length,
        currentEquity: account.equity,
        peakEquity,
        minEquity,
        maxDrawdown: unitDrawdownCurve.reduce((maximum, point) => Math.max(maximum, point.drawdownPercent), 0),
        absoluteDrawdown: latestReport.reportResults?.balanceDrawdownAbsolute ?? null,
        relativeDrawdownPct: latestReport.reportResults?.balanceDrawdownRelativePct ?? null,
        relativeDrawdownAmount: latestReport.reportResults?.balanceDrawdownRelative ?? null,
        maximalDrawdownPct: latestReport.reportResults?.balanceDrawdownMaximalPct ?? null,
        maximalDrawdownAmount: latestReport.reportResults?.balanceDrawdownMaximal ?? null,
        maximalDepositLoad: null,
        maxConsecutiveLoss: latestReport.reportResults?.maximumConsecutiveLosses ?? streaks.worstLossStreak,
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
