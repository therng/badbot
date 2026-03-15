import { NextResponse } from 'next/server';
import {
  calculateCashflowNeutralDrawdown,
  calculateEquityCurve,
  calculateGrowth,
  calculateKPIs,
  calculateYTDGrowth
} from '@/lib/analytics';
import { getAccountWithLatestReport, serializeAccountHeader } from '@/lib/report-data';
import {
  calculatePeriodGrowth,
  filterByStartDate,
  getTimeframeStart,
  parseTimeframe
} from '@/lib/report-metrics';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const accountId = params.id;
    const url = new URL(request.url);
    const timeframe = parseTimeframe(url.searchParams.get('timeframe'));
    const startDate = getTimeframeStart(timeframe);
    const now = new Date();

    const accountData = await getAccountWithLatestReport(accountId);
    if (!accountData) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const { latestReport } = accountData;
    if (!latestReport) {
      return NextResponse.json({ error: 'No report data for this account' }, { status: 404 });
    }

    const filteredDeals = filterByStartDate(latestReport.deal_ledger, (deal) => deal.time, startDate);
    const filteredPositions = filterByStartDate(
      latestReport.closed_positions,
      (position) => position.closed_at,
      startDate
    );

    const equityCurve = calculateEquityCurve(filteredDeals, latestReport.open_positions);
    const drawdown = calculateCashflowNeutralDrawdown(filteredDeals, latestReport.open_positions);
    const kpis = calculateKPIs(filteredDeals, filteredPositions);

    const latestEquity = latestReport.account_summary?.equity ?? 0;
    let growth = 0;

    if (timeframe === 'all-time') {
      growth = calculateGrowth(latestReport.deal_ledger, latestEquity);
    } else if (timeframe === 'year') {
      growth = calculateYTDGrowth(latestReport.deal_ledger, now.getFullYear(), latestEquity);
    } else {
      growth = calculatePeriodGrowth(latestReport.deal_ledger, startDate, null, latestEquity);
    }

    const account = serializeAccountHeader(accountData);
    if (!account) {
      return NextResponse.json({ error: 'Failed to serialize account' }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      kpis: {
        trades: kpis.trades,
        winPercent: kpis.winPercent,
        netProfit: kpis.netProfit,
        drawdown,
        growth,
        equity: latestReport.account_summary?.equity ?? 0
      },
      equityCurve: equityCurve.map((point) => ({
        x: point.time instanceof Date ? point.time.toISOString() : new Date(point.time).toISOString(),
        y: point.equity
      }))
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch account details' }, { status: 500 });
  }
}
