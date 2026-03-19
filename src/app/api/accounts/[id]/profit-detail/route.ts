import { NextRequest, NextResponse } from "next/server";

import {
  dealNet,
  filterBySince,
  getAccountBundle,
  getSinceDate,
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
    const commissionTotal = deals.reduce((total, trade) => total + Number(trade.commission ?? 0), 0);
    const swapTotal = deals.reduce((total, trade) => total + Number(trade.swap ?? 0), 0);
    const avgTradePnL = deals.length ? netProfit / deals.length : 0;
    const bestTrade = deals.length ? Math.max(...deals.map((trade) => trade.pnl)) : 0;
    const worstTrade = deals.length ? Math.min(...deals.map((trade) => trade.pnl)) : 0;

    const bySymbol = Array.from(
      deals.reduce<Map<string, { symbol: string; trades: number; wins: number; netProfit: number }>>((groups, trade) => {
        const symbol = trade.symbol || "UNKNOWN";
        const current = groups.get(symbol) ?? {
          symbol,
          trades: 0,
          wins: 0,
          netProfit: 0,
        };

        current.trades += 1;
        current.netProfit += trade.pnl;
        if (trade.pnl > 0) {
          current.wins += 1;
        }

        groups.set(symbol, current);
        return groups;
      }, new Map()).values(),
    )
      .map((item) => ({
        symbol: item.symbol,
        trades: item.trades,
        netProfit: item.netProfit,
        avgTrade: item.trades ? item.netProfit / item.trades : 0,
        winRate: item.trades ? (item.wins / item.trades) * 100 : 0,
      }))
      .sort((left, right) => right.netProfit - left.netProfit);

    const recentDeals = [...deals]
      .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
      .slice(0, 20)
      .map((trade) => ({
        dealId: trade.dealId,
        symbol: trade.symbol,
        side: trade.direction ?? trade.type,
        volume: trade.volume,
        time: trade.time,
        price: trade.price,
        pnl: trade.pnl,
      }));

    const account = serializeAccountBundle(bundle);
    if (!account) {
      return NextResponse.json({ error: "Failed to serialize account" }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        trades: deals.length,
        netProfit,
        grossProfit,
        grossLoss,
        commissionTotal,
        swapTotal,
        avgTradePnL,
        bestTrade,
        worstTrade,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
      },
      bySymbol,
      recentDeals,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch profit detail" }, { status: 500 });
  }
}
