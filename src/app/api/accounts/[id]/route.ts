import { NextRequest, NextResponse } from "next/server";

import {
  buildBalanceEquityCurve,
  computeBalanceDrawdown,
  computeAbsoluteGain,
  computeAllTimeGrowth,
  computeCompoundedGrowth,
  computeYearGrowth,
  filterBySince,
  getAccountBundle,
  getSinceDate,
  isTradingDeal,
  parseTimeframe,
  serializeAccountBundle,
  summarizeTrades,
} from "@/lib/trading/account-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const timeframe = parseTimeframe(request.nextUrl.searchParams.get("timeframe"));
    const bundle = await getAccountBundle(params.id);

    if (!bundle) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { latestReport } = bundle;
    if (!latestReport) {
      return NextResponse.json({ error: "No report data for this account" }, { status: 404 });
    }

    const reportTime = latestReport.reportDate ? new Date(latestReport.reportDate) : new Date();
    const since = getSinceDate(timeframe, reportTime);
    const account = serializeAccountBundle(bundle);
    if (!account) {
      return NextResponse.json({ error: "Failed to serialize account" }, { status: 500 });
    }

    const filteredDeals = filterBySince(latestReport.dealLedger, (deal) => deal.time, since);
    const tradingDeals = filteredDeals.filter((deal) => isTradingDeal(deal.type));
    const equityCurve = buildBalanceEquityCurve(filteredDeals, latestReport.openPositions);
    const drawdown = computeBalanceDrawdown(
      filteredDeals,
      filteredDeals.length ? Number(filteredDeals[filteredDeals.length - 1].balanceAfter ?? 0) : account?.balance ?? 0,
    ).percent;
    const outcomeSummary = summarizeTrades(tradingDeals);

    const growth =
      timeframe === "all-time"
        ? computeAllTimeGrowth(latestReport.dealLedger)
        : timeframe === "year"
          ? computeYearGrowth(latestReport.dealLedger, reportTime.getFullYear())
          : computeCompoundedGrowth(latestReport.dealLedger, since, null);

    const absoluteGain =
      timeframe === "all-time"
        ? computeAbsoluteGain(latestReport.dealLedger, null)
        : timeframe === "year"
          ? computeAbsoluteGain(
              latestReport.dealLedger,
              new Date(reportTime.getFullYear(), 0, 1, 0, 0, 0, 0),
              new Date(reportTime.getFullYear(), 11, 31, 23, 59, 59, 999),
            )
          : computeAbsoluteGain(latestReport.dealLedger, since, null);

    return NextResponse.json({
      timeframe,
      account,
      kpis: {
        trades: outcomeSummary.trades,
        winPercent: outcomeSummary.winPercent,
        netProfit: outcomeSummary.netProfit,
        drawdown,
        growth,
        absoluteGain,
        equity: latestReport.accountSummary?.equity ?? 0,
        openCount: latestReport.openPositions.length,
      },
      equityCurve: equityCurve.map((point) => ({
        x: point.time instanceof Date ? point.time.toISOString() : new Date(point.time).toISOString(),
        y: point.equity,
      })),
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch account details" }, { status: 500 });
  }
}
