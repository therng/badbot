import { NextRequest, NextResponse } from "next/server";

import {
  dealNet,
  filterBySince,
  getAccountBundle,
  getSinceDate,
  getReportWinPercent,
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
    const trades = filterBySince(
      latestReport.dealLedger.filter((deal) => isTradingDeal(deal.type)),
      (trade) => trade.time,
      since,
    ).map((trade) => ({
      ...trade,
      pnl: dealNet(trade),
    }));

    const wins = trades.filter((trade) => trade.pnl > 0);
    const losses = trades.filter((trade) => trade.pnl < 0);
    const totalTrades = trades.length;
    const reportResults = latestReport.reportResults ?? null;
    const reportWins = Number(reportResults?.profitTradesCount ?? wins.length);
    const reportLosses = Number(reportResults?.lossTradesCount ?? losses.length);

    const bySymbol = Array.from(
      trades.reduce<Map<string, { symbol: string; trades: number; wins: number; netProfit: number }>>((groups, trade) => {
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
        winRate: item.trades ? (item.wins / item.trades) * 100 : 0,
      }))
      .sort((left, right) => right.winRate - left.winRate);

    const bySide = Array.from(
      trades.reduce<Map<string, { side: string; trades: number; wins: number; netProfit: number }>>((groups, trade) => {
        const normalizedType = typeof trade.type === "string" ? trade.type.trim().toLowerCase() : "";
        const normalizedDirection = typeof trade.direction === "string" ? trade.direction.trim().toLowerCase() : "";
        const side = normalizedType === "buy" || normalizedType === "sell"
          ? normalizedType.toUpperCase()
          : normalizedDirection === "buy" || normalizedDirection === "sell"
            ? normalizedDirection.toUpperCase()
            : "UNKNOWN";
        const current = groups.get(side) ?? {
          side,
          trades: 0,
          wins: 0,
          netProfit: 0,
        };

        current.trades += 1;
        current.netProfit += trade.pnl;
        if (trade.pnl > 0) {
          current.wins += 1;
        }

        groups.set(side, current);
        return groups;
      }, new Map()).values(),
    ).map((item) => ({
      side: item.side,
      trades: item.trades,
      netProfit: item.netProfit,
      winRate: item.trades ? (item.wins / item.trades) * 100 : 0,
    }));

    const outcomeSeries = [...trades]
      .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime())
      .slice(-30)
      .map((trade) => ({
        x: new Date(trade.time).toISOString(),
        y: trade.pnl,
      }));

    const account = serializeAccountBundle(bundle);
    if (!account) {
      return NextResponse.json({ error: "Failed to serialize account" }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        winRate: getReportWinPercent(reportResults),
        wins: reportWins,
        losses: reportLosses,
        sharpeRatio: latestReport.reportResults?.sharpeRatio ?? null,
        profitFactor: latestReport.reportResults?.profitFactor ?? null,
        recoveryFactor: latestReport.reportResults?.recoveryFactor ?? null,
        expectedPayoff: latestReport.reportResults?.expectedPayoff ?? null,
        averageConsecutiveWins: latestReport.reportResults?.maximumConsecutiveWins ?? null,
        averageConsecutiveLosses: latestReport.reportResults?.maximumConsecutiveLosses ?? null,
      },
      bySymbol,
      bySide,
      outcomeSeries,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch win detail" }, { status: 500 });
  }
}
