import { NextResponse } from 'next/server';
import { getAccountWithLatestReport, serializeAccountHeader } from '@/lib/report-data';
import { filterByStartDate, getTimeframeStart, parseTimeframe } from '@/lib/report-metrics';

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

    const tradesWithPnL = closedPositions.map((position) => ({
      ...position,
      pnl: tradePnL(position)
    }));

    const netProfit = tradesWithPnL.reduce((sum, position) => sum + position.pnl, 0);
    const grossProfit = tradesWithPnL
      .filter((position) => position.pnl > 0)
      .reduce((sum, position) => sum + position.pnl, 0);
    const grossLoss = Math.abs(
      tradesWithPnL
        .filter((position) => position.pnl < 0)
        .reduce((sum, position) => sum + position.pnl, 0)
    );
    const commissionTotal = tradesWithPnL.reduce(
      (sum, position) => sum + Number(position.commission ?? 0),
      0
    );
    const swapTotal = tradesWithPnL.reduce((sum, position) => sum + Number(position.swap ?? 0), 0);
    const avgTradePnL = tradesWithPnL.length ? netProfit / tradesWithPnL.length : 0;
    const bestTrade = tradesWithPnL.length ? Math.max(...tradesWithPnL.map((position) => position.pnl)) : 0;
    const worstTrade = tradesWithPnL.length ? Math.min(...tradesWithPnL.map((position) => position.pnl)) : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

    const symbolMap = new Map<
      string,
      { symbol: string; trades: number; wins: number; netProfit: number; avgTrade: number }
    >();

    for (const position of tradesWithPnL) {
      const key = position.symbol || 'UNKNOWN';
      const existing = symbolMap.get(key) ?? {
        symbol: key,
        trades: 0,
        wins: 0,
        netProfit: 0,
        avgTrade: 0
      };

      existing.trades += 1;
      existing.netProfit += position.pnl;
      if (position.pnl > 0) existing.wins += 1;
      symbolMap.set(key, existing);
    }

    const bySymbol = Array.from(symbolMap.values())
      .map((entry) => ({
        symbol: entry.symbol,
        trades: entry.trades,
        netProfit: entry.netProfit,
        avgTrade: entry.trades ? entry.netProfit / entry.trades : 0,
        winRate: entry.trades ? (entry.wins / entry.trades) * 100 : 0
      }))
      .sort((a, b) => b.netProfit - a.netProfit);

    const recentTrades = [...tradesWithPnL]
      .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
      .slice(0, 20)
      .map((position) => ({
        positionId: position.position_id,
        symbol: position.symbol,
        side: position.side,
        volume: position.volume,
        openedAt: position.opened_at,
        closedAt: position.closed_at,
        pnl: position.pnl
      }));

    const account = serializeAccountHeader(accountData);
    if (!account) {
      return NextResponse.json({ error: 'Failed to serialize account' }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        trades: tradesWithPnL.length,
        netProfit,
        grossProfit,
        grossLoss,
        commissionTotal,
        swapTotal,
        avgTradePnL,
        bestTrade,
        worstTrade,
        profitFactor
      },
      bySymbol,
      recentTrades
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch profit detail' }, { status: 500 });
  }
}
