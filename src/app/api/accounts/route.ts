import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { accountStatusFromTimestamp } from '@/lib/report-metrics';
import { normalizeOptionalText } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      include: {
        reports: {
          orderBy: { report_timestamp: 'desc' },
          take: 1,
          include: {
            account_summary: true
          }
        }
      },
      orderBy: { account_number: 'asc' }
    });

    const formattedAccounts = accounts.map((account) => {
      const latestReport = account.reports[0];
      const latestSummary = latestReport?.account_summary;

      return {
        id: account.id,
        account_number: account.account_number,
        owner_name: normalizeOptionalText(account.owner_name),
        currency: normalizeOptionalText(account.currency) ?? 'USD',
        server: normalizeOptionalText(account.server) ?? '',
        account_mode: normalizeOptionalText(account.account_mode),
        position_mode: normalizeOptionalText(account.position_mode),
        status: accountStatusFromTimestamp(latestReport?.report_timestamp),
        balance: latestSummary?.balance ?? 0,
        equity: latestSummary?.equity ?? 0,
        floating_pl: latestSummary?.floating_pl ?? 0,
        margin_level: latestSummary?.margin_level ?? null,
        last_updated: latestReport?.report_timestamp ?? null
      };
    });

    const response = NextResponse.json(formattedAccounts);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return response;
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}
