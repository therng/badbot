import { NextRequest, NextResponse } from "next/server";

import {
  buildDailyProfitSeries,
  dealNet,
  filterBySince,
  getAccountBundle,
  getSinceDate,
  isTradingDeal,
  parseTimeframe,
  serializeAccountBundle,
  buildFundingTotals,
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
    const deals = filterBySince(
      latestReport.dealLedger.filter((deal) => isTradingDeal(deal.type)),
      (trade) => trade.time,
      since,
    ).map((trade) => ({
      ...trade,
      pnl: dealNet(trade),
    }));

    const netProfit = deals.reduce((total, trade) => total + trade.pnl, 0);
    const grossProfit = deals.filter((trade) => trade.pnl > 0).reduce((total, trade) => total + trade.pnl, 0);
    const grossLoss = Math.abs(deals.filter((trade) => trade.pnl < 0).reduce((total, trade) => total + trade.pnl, 0));
    const totalCommission = latestReport.reportResults?.totalCommission
      ?? deals.reduce((total, trade) => total + Number(trade.commission ?? 0), 0);
    const totalSwap = latestReport.reportResults?.totalSwap
      ?? deals.reduce((total, trade) => total + Number(trade.swap ?? 0), 0);
    const fundingTotals = buildFundingTotals(latestReport.dealLedger);
    const totalDeposit = fundingTotals.totalDeposit;
    const totalWithdrawal = fundingTotals.totalWithdraw;
    const allTradingDeals = latestReport.dealLedger
      .filter((deal) => isTradingDeal(deal.type))
      .map((trade) => ({
        ...trade,
        pnl: dealNet(trade),
      }));

    const dailyProfit = buildDailyProfitSeries(allTradingDeals, 5, reportTime);
    const profitFactor = latestReport.reportResults?.profitFactor ?? null;

    const account = serializeAccountBundle(bundle);
    if (!account) {
      return NextResponse.json({ error: "Failed to serialize account" }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        netProfit,
        grossProfit,
        grossLoss,
        totalCommission,
        totalSwap,
        totalDeposit,
        totalWithdrawal,
        profitFactor,
        dailyProfit,
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch overall profit detail" }, { status: 500 });
  }
}
