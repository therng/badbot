import { NextRequest, NextResponse } from "next/server";

import {
  buildBalanceEquityCurve,
  computeBalanceDrawdown,
  filterBySince,
  getAccountBundle,
  getPrimaryDrawdownPercent,
  getReportWinPercent,
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
    const computedDrawdown = computeBalanceDrawdown(
      filteredDeals,
      filteredDeals.length ? Number(filteredDeals[filteredDeals.length - 1].balanceAfter ?? Number.NaN) : account?.balance ?? 0,
    ).percent;
    const outcomeSummary = summarizeTrades(tradingDeals);
    const reportResults = latestReport.reportResults ?? null;
    const drawdown = getPrimaryDrawdownPercent(reportResults) || computedDrawdown;
    const winPercent = getReportWinPercent(reportResults);

    return NextResponse.json({
      timeframe,
      account,
      kpis: {
        netProfit: outcomeSummary.netProfit,
        drawdown,
        winPercent,
        trades: outcomeSummary.trades,
        floatingPL: latestReport.accountSummary?.floatingPl ?? 0,
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
