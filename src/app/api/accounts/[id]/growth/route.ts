import { NextResponse } from 'next/server';
import { calculateGrowth, calculateYTDGrowth } from '@/lib/analytics';
import { getAccountWithLatestReport, serializeAccountHeader } from '@/lib/report-data';
import { calculatePeriodGrowth, getTimeframeStart, parseTimeframe } from '@/lib/report-metrics';

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
    const currentYear = new Date().getFullYear();
    const latestEquity = latestReport.account_summary?.equity ?? 0;
    const allDeals = latestReport.deal_ledger;

    const allTimeGrowth = calculateGrowth(allDeals, latestEquity);
    const ytdGrowth = calculateYTDGrowth(allDeals, currentYear, latestEquity);

    let periodGrowth = allTimeGrowth;
    if (timeframe === 'year') {
      periodGrowth = ytdGrowth;
    } else if (timeframe !== 'all-time') {
      periodGrowth = calculatePeriodGrowth(allDeals, startDate, null, latestEquity);
    }

    const monthlySeries = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = new Date(currentYear, monthIndex, 1, 0, 0, 0, 0);
      const monthEnd = new Date(currentYear, monthIndex + 1, 0, 23, 59, 59, 999);
      const value = calculatePeriodGrowth(allDeals, monthStart, monthEnd);

      return {
        month: monthStart.toLocaleString('en-US', { month: 'short' }),
        value
      };
    });

    const dealYears = allDeals.map((deal) => new Date(deal.time).getFullYear());
    const firstYear = dealYears.length ? Math.min(...dealYears) : currentYear;
    const startYear = Math.max(firstYear, currentYear - 4);

    const yearlySeries = Array.from({ length: currentYear - startYear + 1 }, (_, offset) => {
      const year = startYear + offset;
      const value =
        year === currentYear
          ? calculateYTDGrowth(allDeals, year, latestEquity)
          : calculatePeriodGrowth(
              allDeals,
              new Date(year, 0, 1, 0, 0, 0, 0),
              new Date(year, 11, 31, 23, 59, 59, 999)
            );

      return { year, value };
    });

    const balanceOperations = allDeals
      .filter((deal) => (deal.type ?? '').toLowerCase().includes('balance'))
      .map((deal) => ({
        time: new Date(deal.time).toISOString(),
        type: deal.type,
        delta: Number(deal.profit ?? 0) + Number(deal.commission ?? 0) + Number(deal.swap ?? 0)
      }));

    const account = serializeAccountHeader(accountData);
    if (!account) {
      return NextResponse.json({ error: 'Failed to serialize account' }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        periodGrowth,
        ytdGrowth,
        allTimeGrowth
      },
      series: {
        monthly: monthlySeries,
        yearly: yearlySeries
      },
      balanceOperations
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch growth detail' }, { status: 500 });
  }
}
