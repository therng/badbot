import { NextResponse } from 'next/server';
import { getAccountWithLatestReport, serializeAccountHeader } from '@/lib/report-data';
import {
  computeStreaks,
  filterByStartDate,
  getTimeframeStart,
  parseTimeframe
} from '@/lib/report-metrics';

export const dynamic = 'force-dynamic';

function tradePnL(position: { profit: number; swap: number; commission: number }): number {
  return Number(position.profit ?? 0) + Number(position.swap ?? 0) + Number(position.commission ?? 0);
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const accountData = await getAccountWithLatestReport(params.id);
    if (!accountData) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const { latestReport } = accountData;
    if (!latestReport) {
      return NextResponse.json({ error: 'No report data for this account' }, { status: 404 });
    }

    const url = new URL(request.url);
    const timeframe = parseTimeframe(url.searchParams.get('timeframe'));
    const startDate = getTimeframeStart(timeframe);

    const closedPositions = filterByStartDate(
      latestReport.closed_positions,
      (position) => position.closed_at,
      startDate
    );

    const outcomes = closedPositions.map((position) => ({
      ...position,
      pnl: tradePnL(position)
    }));

    const wins = outcomes.filter((position) => position.pnl > 0);
    const losses = outcomes.filter((position) => position.pnl < 0);
    const breakeven = outcomes.filter((position) => position.pnl === 0);

    const totalTrades = outcomes.length;
    const winRate = totalTrades ? (wins.length / totalTrades) * 100 : 0;
    const lossRate = totalTrades ? (losses.length / totalTrades) * 100 : 0;
    const avgWin = wins.length ? wins.reduce((sum, position) => sum + position.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length
      ? Math.abs(losses.reduce((sum, position) => sum + position.pnl, 0) / losses.length)
      : 0;
    const netProfit = outcomes.reduce((sum, position) => sum + position.pnl, 0);
    const expectancy = totalTrades ? netProfit / totalTrades : 0;

    const streaks = computeStreaks(outcomes.map((position) => position.pnl));

    const bySymbolMap = new Map<string, { symbol: string; trades: number; wins: number; netProfit: number }>();
    const bySideMap = new Map<string, { side: string; trades: number; wins: number; netProfit: number }>();

    for (const position of outcomes) {
      const symbolKey = position.symbol || 'UNKNOWN';
      const sideKey = position.side || 'UNKNOWN';

      const symbolEntry = bySymbolMap.get(symbolKey) ?? {
        symbol: symbolKey,
        trades: 0,
        wins: 0,
        netProfit: 0
      };
      symbolEntry.trades += 1;
      symbolEntry.netProfit += position.pnl;
      if (position.pnl > 0) symbolEntry.wins += 1;
      bySymbolMap.set(symbolKey, symbolEntry);

      const sideEntry = bySideMap.get(sideKey) ?? {
        side: sideKey,
        trades: 0,
        wins: 0,
        netProfit: 0
      };
      sideEntry.trades += 1;
      sideEntry.netProfit += position.pnl;
      if (position.pnl > 0) sideEntry.wins += 1;
      bySideMap.set(sideKey, sideEntry);
    }

    const bySymbol = Array.from(bySymbolMap.values())
      .map((entry) => ({
        symbol: entry.symbol,
        trades: entry.trades,
        netProfit: entry.netProfit,
        winRate: entry.trades ? (entry.wins / entry.trades) * 100 : 0
      }))
      .sort((a, b) => b.winRate - a.winRate);

    const bySide = Array.from(bySideMap.values()).map((entry) => ({
      side: entry.side,
      trades: entry.trades,
      netProfit: entry.netProfit,
      winRate: entry.trades ? (entry.wins / entry.trades) * 100 : 0
    }));

    const recentOutcomes = [...outcomes]
      .sort((a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime())
      .slice(-30)
      .map((position) => ({
        x: new Date(position.closed_at).toISOString(),
        y: position.pnl
      }));

    const account = serializeAccountHeader(accountData);
    if (!account) {
      return NextResponse.json({ error: 'Failed to serialize account' }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        totalTrades,
        wins: wins.length,
        losses: losses.length,
        breakeven: breakeven.length,
        winRate,
        lossRate,
        avgWin,
        avgLoss,
        expectancy,
        bestWinStreak: streaks.bestWinStreak,
        worstLossStreak: streaks.worstLossStreak
      },
      bySymbol,
      bySide,
      outcomeSeries: recentOutcomes
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch win detail' }, { status: 500 });
  }
}
