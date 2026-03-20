import { NextRequest, NextResponse } from "next/server";

import {
  dealNet,
  buildSymbolTradePercent,
  getLongTradeWinPercent,
  getShortTradeWinPercent,
  filterBySince,
  getAccountBundle,
  getSinceDate,
  isTradingDeal,
  parseTimeframe,
  serializeAccountBundle,
} from "@/lib/trading/account-data";

function computeTradesPerWeek(
  timeframe: ReturnType<typeof parseTimeframe>,
  deals: Array<{ time: Date | string }>,
) {
  if (timeframe === "all-time") {
    return null;
  }

  if (deals.length < 2) {
    return null;
  }

  const sorted = [...deals].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  const oldest = new Date(sorted[0].time).getTime();
  const newest = new Date(sorted[sorted.length - 1].time).getTime();

  if (!Number.isFinite(oldest) || !Number.isFinite(newest) || newest <= oldest) {
    return null;
  }

  const weeks = Math.max(1, (newest - oldest) / 604_800_000);
  return deals.length / weeks;
}

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
    const closedDeals = filterBySince(
      latestReport.dealLedger.filter((deal) => isTradingDeal(deal.type)),
      (trade) => trade.time,
      since,
    );

    const openPositions = latestReport.openPositions.map((position) => ({
      positionId: position.positionId,
      openedAt: position.openedAt,
      symbol: position.symbol,
      side: position.side,
      volume: position.volume,
      openPrice: position.openPrice,
      sl: position.sl,
      tp: position.tp,
      marketPrice: position.marketPrice,
      floatingProfit: position.floatingProfit,
      swap: position.swap,
      comment: position.comment,
    }));

    const workingOrders = latestReport.workingOrders.map((order) => ({
      orderId: order.orderId,
      openedAt: order.openedAt,
      symbol: order.symbol,
      type: order.type,
      volume: order.volumeFilled ?? order.volumeRequested ?? 0,
      price: order.price,
      sl: order.sl,
      tp: order.tp,
      marketPrice: order.marketPrice,
      state: order.state,
      comment: order.comment,
    }));

    const recentDeals = [...closedDeals]
      .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
      .slice(0, 30)
      .map((trade) => ({
        dealId: trade.dealId,
        symbol: trade.symbol,
        side: trade.direction ?? trade.type,
        volume: trade.volume,
        time: trade.time,
        price: trade.price,
        pnl: dealNet(trade),
      }));

    const summary = {
      dealCount: closedDeals.length,
      tradesPerWeek: computeTradesPerWeek(timeframe, closedDeals),
      longTradeWin: getLongTradeWinPercent(latestReport.reportResults ?? null),
      shortTradeWin: getShortTradeWinPercent(latestReport.reportResults ?? null),
      symbolTradePercent: buildSymbolTradePercent(closedDeals),
      openCount: openPositions.length,
      floatingProfit: openPositions.reduce((total, position) => total + Number(position.floatingProfit ?? 0), 0),
    };

    const openBySymbol = Object.values(
      openPositions.reduce<Record<string, { symbol: string; count: number; volume: number; floatingProfit: number }>>(
        (groups, position) => {
          const symbol = position.symbol || "UNKNOWN";
          const current = groups[symbol] ?? {
            symbol,
            count: 0,
            volume: 0,
            floatingProfit: 0,
          };

          current.count += 1;
          current.volume += Number(position.volume ?? 0);
          current.floatingProfit += Number(position.floatingProfit ?? 0);
          groups[symbol] = current;
          return groups;
        },
        {},
      ),
    ).sort((left, right) => Math.abs(right.floatingProfit) - Math.abs(left.floatingProfit));

    const account = serializeAccountBundle(bundle);
    if (!account) {
      return NextResponse.json({ error: "Failed to serialize account" }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary,
      openPositions,
      workingOrders,
      openBySymbol,
      recentDeals,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch positions" }, { status: 500 });
  }
}
