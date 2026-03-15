import { prisma } from '@/lib/db';
import { accountStatusFromTimestamp } from '@/lib/report-metrics';
import { normalizeOptionalText } from '@/lib/utils';

export async function getAccountWithLatestReport(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      reports: {
        orderBy: { report_timestamp: 'desc' },
        take: 1,
        include: {
          account_summary: true,
          deal_ledger: { orderBy: { time: 'asc' } },
          closed_positions: { orderBy: { closed_at: 'asc' } },
          open_positions: true,
          working_orders: true,
          order_history: true
        }
      }
    }
  });

  if (!account) return null;
  const latestReport = account.reports[0] ?? null;

  return { account, latestReport };
}

export function serializeAccountHeader(data: Awaited<ReturnType<typeof getAccountWithLatestReport>>) {
  if (!data) return null;

  const { account, latestReport } = data;
  const latestSummary = latestReport?.account_summary;
  const status = accountStatusFromTimestamp(latestReport?.report_timestamp);

  return {
    id: account.id,
    account_number: account.account_number,
    owner_name: normalizeOptionalText(account.owner_name),
    currency: normalizeOptionalText(account.currency) ?? 'USD',
    server: normalizeOptionalText(account.server) ?? '',
    account_mode: normalizeOptionalText(account.account_mode),
    position_mode: normalizeOptionalText(account.position_mode),
    status,
    last_updated: latestReport?.report_timestamp ?? null,
    balance: latestSummary?.balance ?? 0,
    equity: latestSummary?.equity ?? 0,
    floating_pl: latestSummary?.floating_pl ?? 0,
    margin_level: latestSummary?.margin_level ?? null
  };
}
