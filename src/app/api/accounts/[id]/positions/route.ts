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

    const openPositions = latestReport.open_positions.map((position) => ({
      positionId: position.position_id,
      symbol: position.symbol,
      side: position.side,
      volume: position.volume,
      openPrice: position.open_price,
      marketPrice: position.market_price,
      floatingProfit: position.floating_profit,
      swap: position.swap,
      comment: position.comment
    }));

    const workingOrders = latestReport.working_orders.map((order) => ({
      orderId: order.order_id,
      symbol: order.symbol,
      type: order.type,
      volume: order.volume,
      price: order.price,
      state: order.state,
      comment: order.comment
    }));

    const recentClosedPositions = [...closedPositions]
      .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
      .slice(0, 30)
      .map((position) => ({
        positionId: position.position_id,
        symbol: position.symbol,
        side: position.side,
        volume: position.volume,
        openedAt: position.opened_at,
        closedAt: position.closed_at,
        openPrice: position.open_price,
        closePrice: position.close_price,
        pnl: tradePnL(position)
      }));

    const summary = {
      openCount: openPositions.length,
      workingCount: workingOrders.length,
      closedCount: closedPositions.length,
      openVolume: openPositions.reduce((sum, position) => sum + Number(position.volume ?? 0), 0),
      floatingProfit: openPositions.reduce(
        (sum, position) => sum + Number(position.floatingProfit ?? 0),
        0
      ),
      realizedProfit: closedPositions.reduce((sum, position) => sum + tradePnL(position), 0)
    };

    const openBySymbol = Object.values(
      openPositions.reduce<Record<string, { symbol: string; count: number; volume: number; floatingProfit: number }>>(
        (acc, position) => {
          const key = position.symbol || 'UNKNOWN';
          const entry = acc[key] ?? { symbol: key, count: 0, volume: 0, floatingProfit: 0 };
          entry.count += 1;
          entry.volume += Number(position.volume ?? 0);
          entry.floatingProfit += Number(position.floatingProfit ?? 0);
          acc[key] = entry;
          return acc;
        },
        {}
      )
    ).sort((a, b) => Math.abs(b.floatingProfit) - Math.abs(a.floatingProfit));

    const account = serializeAccountHeader(accountData);
    if (!account) {
      return NextResponse.json({ error: 'Failed to serialize account' }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary,
      openPositions,
      workingOrders,
      openBySymbol,
      recentClosedPositions
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
}
