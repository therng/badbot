import { NextResponse } from 'next/server';
import {
  calculateCashflowNeutralDrawdownSeries,
  calculateEquityCurve
} from '@/lib/analytics';
import { getAccountWithLatestReport, serializeAccountHeader } from '@/lib/report-data';
import { filterByStartDate, getTimeframeStart, parseTimeframe } from '@/lib/report-metrics';

export const dynamic = 'force-dynamic';

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

    const filteredDeals = filterByStartDate(latestReport.deal_ledger, (deal) => deal.time, startDate);
    const equityCurve = calculateEquityCurve(filteredDeals, latestReport.open_positions);
    const drawdownSeries = calculateCashflowNeutralDrawdownSeries(
      filteredDeals,
      latestReport.open_positions
    );
    const serializedCurve = equityCurve.map((point) => ({
      x: point.time instanceof Date ? point.time.toISOString() : new Date(point.time).toISOString(),
      equity: point.equity,
      balance: point.balance
    }));

    let peakEquity = 0;
    let minEquity = 0;
    const serializedDrawdownSeries: Array<{ x: string; y: number }> = [];

    if (serializedCurve.length) {
      peakEquity = serializedCurve[0].equity;
      minEquity = serializedCurve[0].equity;
    }

    for (const point of serializedCurve) {
      peakEquity = Math.max(peakEquity, point.equity);
      minEquity = Math.min(minEquity, point.equity);
    }

    for (const point of drawdownSeries) {
      const x = point.time instanceof Date ? point.time.toISOString() : new Date(point.time).toISOString();
      serializedDrawdownSeries.push({ x, y: point.drawdownPercent });
    }

    const maxDrawdown = drawdownSeries.reduce(
      (max, point) => Math.max(max, point.drawdownPercent),
      0
    );
    const account = serializeAccountHeader(accountData);

    if (!account) {
      return NextResponse.json({ error: 'Failed to serialize account' }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        points: serializedCurve.length,
        currentEquity: account.equity,
        peakEquity,
        minEquity,
        maxDrawdown
      },
      equityCurve: serializedCurve,
      drawdownCurve: serializedDrawdownSeries
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch equity detail' }, { status: 500 });
  }
}
