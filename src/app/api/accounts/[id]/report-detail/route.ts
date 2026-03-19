import { NextResponse } from "next/server";

import {
  buildBalanceEquityCurve,
  computeBalanceDrawdown,
  computeStreaks,
  dealNet,
  getAccountBundle,
  isFundingDeal,
  isTradingDeal,
  serializeAccountBundle,
} from "@/lib/trading/account-data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const bundle = await getAccountBundle(params.id);
    if (!bundle) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { latestReport } = bundle;
    if (!latestReport) {
      return NextResponse.json({ error: "No report data for this account" }, { status: 404 });
    }

    const account = serializeAccountBundle(bundle);
    if (!account) {
      return NextResponse.json({ error: "Failed to serialize account" }, { status: 500 });
    }

    const sortedDeals = [...latestReport.dealLedger].sort(
      (left, right) => new Date(left.time).getTime() - new Date(right.time).getTime(),
    );
    const equityCurve = buildBalanceEquityCurve(sortedDeals, latestReport.openPositions).map((point, index) => {
      const deal = sortedDeals[index] ?? null;
      return {
        x: point.time instanceof Date ? point.time.toISOString() : new Date(point.time).toISOString(),
        equity: point.equity,
        balance: point.balance,
        eventType: deal?.type ?? null,
        eventDelta: deal ? dealNet(deal) : null,
      };
    });

    const results = sortedDeals
      .filter((deal) => isTradingDeal(deal.type))
      .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
      .map((trade) => {
        const net = dealNet(trade);
        return {
          dealId: trade.dealId,
          symbol: trade.symbol,
          side: trade.direction ?? trade.type,
          volume: trade.volume,
          time: trade.time,
          price: trade.price,
          profit: trade.profit,
          swap: trade.swap,
          commission: trade.commission,
          net,
          comment: trade.comment,
        };
      });
    const chronologicalResults = [...results].sort(
      (left, right) => new Date(left.time).getTime() - new Date(right.time).getTime(),
    );

    const wins = results.filter((trade) => trade.net > 0).length;
    const losses = results.filter((trade) => trade.net < 0).length;
    const breakeven = results.length - wins - losses;
    const netProfit = results.reduce((total, trade) => total + trade.net, 0);
    const grossProfit = results.reduce((total, trade) => (trade.net > 0 ? total + trade.net : total), 0);
    const grossLoss = Math.abs(results.reduce((total, trade) => (trade.net < 0 ? total + trade.net : total), 0));
    const openVolume = latestReport.openPositions.reduce((total, position) => total + Number(position.volume ?? 0), 0);
    const resultVolume = results.reduce((total, trade) => total + Number(trade.volume ?? 0), 0);
    const commissionTotal = results.reduce((total, trade) => total + Number(trade.commission ?? 0), 0);
    const swapTotal = results.reduce((total, trade) => total + Number(trade.swap ?? 0), 0);
    const avgTradeNet = results.length ? netProfit / results.length : 0;
    const avgWin = wins ? grossProfit / wins : 0;
    const avgLoss = losses ? grossLoss / losses : 0;
    const longTrades = results.filter((trade) => trade.side.toLowerCase() === "buy");
    const shortTrades = results.filter((trade) => trade.side.toLowerCase() === "sell");
    const longWins = longTrades.filter((trade) => trade.net > 0).length;
    const shortWins = shortTrades.filter((trade) => trade.net > 0).length;
    const streaks = computeStreaks(chronologicalResults.map((trade) => trade.net));
    const endingAdjustedBalance = sortedDeals.reduce((balance, deal) => {
      if (isFundingDeal(deal.type)) {
        return balance;
      }

      const nextBalance = Number(deal.balanceAfter ?? Number.NaN);
      return Number.isFinite(nextBalance) ? nextBalance : balance;
    }, latestReport.accountSummary?.balance ?? 0);
    const balanceDrawdown = computeBalanceDrawdown(sortedDeals, endingAdjustedBalance);
    const bestTrade = results.length ? Math.max(...results.map((trade) => trade.net)) : null;
    const worstTrade = results.length ? Math.min(...results.map((trade) => trade.net)) : null;

    return NextResponse.json({
      account,
      report: {
        fileName: latestReport.fileName,
        reportTimestamp: latestReport.reportDate,
      },
      summary: {
        balance: latestReport.accountSummary?.balance ?? 0,
        equity: latestReport.accountSummary?.equity ?? 0,
        floatingProfit: latestReport.accountSummary?.floatingPl ?? 0,
        margin: latestReport.accountSummary?.margin ?? 0,
        freeMargin: latestReport.accountSummary?.freeMargin ?? 0,
        marginLevel: latestReport.accountSummary?.marginLevel ?? null,
        openCount: latestReport.openPositions.length,
        workingCount: latestReport.workingOrders.length,
        resultCount: results.length,
        openVolume,
        resultVolume,
        grossProfit: latestReport.reportResults?.grossProfit ?? grossProfit,
        grossLoss: latestReport.reportResults?.grossLoss ?? grossLoss,
        netProfit: latestReport.reportResults?.totalNetProfit ?? netProfit,
        commissionTotal: latestReport.reportResults?.totalCommission ?? commissionTotal,
        swapTotal: latestReport.reportResults?.totalSwap ?? swapTotal,
        winRate: results.length ? (wins / results.length) * 100 : 0,
        bestTrade,
        worstTrade,
      },
      balanceDrawdown,
      tradeStats: {
        totalTrades: results.length,
        wins,
        losses,
        breakeven,
        winRate: results.length ? (wins / results.length) * 100 : 0,
        lossRate: results.length ? (losses / results.length) * 100 : 0,
        totalVolume: resultVolume,
        averageVolume: results.length ? resultVolume / results.length : 0,
        avgTradeNet,
        avgWin,
        avgLoss,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
        expectancy: avgTradeNet,
        bestTrade,
        worstTrade,
        bestWinStreak: streaks.bestWinStreak,
        worstLossStreak: streaks.worstLossStreak,
        longTrades: longTrades.length,
        shortTrades: shortTrades.length,
        longWinRate: longTrades.length ? (longWins / longTrades.length) * 100 : 0,
        shortWinRate: shortTrades.length ? (shortWins / shortTrades.length) * 100 : 0,
      },
      equityCurve,
      balanceOperations: sortedDeals
        .filter((deal) => isFundingDeal(deal.type))
        .map((deal) => ({
          time: deal.time,
          type: deal.type,
          delta: dealNet(deal),
          balanceAfter: deal.balanceAfter,
        }))
        .reverse(),
      openPositions: latestReport.openPositions.map((position) => ({
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
      })),
      workingOrders: latestReport.workingOrders.map((order) => ({
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
      })),
      results,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch report detail" }, { status: 500 });
  }
}
