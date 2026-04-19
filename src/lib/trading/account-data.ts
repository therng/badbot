import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getAccountStatus,
  getLatestDealBalance,
  sanitizeOptionalText,
} from "@/lib/trading/analytics";
import type { SerializedAccount } from "@/lib/trading/types";

export {
  buildBalanceCurve,
  buildDailyProfitSeries,
  buildFundingTotals,
  buildSymbolTradePercent,
  buildUnitDrawdownCurve,
  computeAbsoluteGain,
  computeAllTimeGrowth,
  computeAverageHoldHours,
  computeBalanceDrawdown,
  computeCompoundedGrowth,
  computeConsecutiveRunAmounts,
  computeDepositLoadPercent,
  computeTradeActivityPercent,
  computeTradesPerWeek,
  computeSharpeRatio,
  computeStreaks,
  computeYearGrowth,
  dealNet,
  filterByDateRange,
  filterBySince,
  getLongTradeWinPercent,
  getShortTradeWinPercent,
  getSinceDate,
  getTimeframeLabel,
  getTradeWinPercent,
  isBalanceDeal,
  isFundingDeal,
  isTradingDeal,
  normalizeTradeSide,
  parseTimeframe,
  positionNetPnl,
  positionProfit,
  sanitizeOptionalText,
  summarizeClosedPositions,
  startOfDay,
  endOfDay,
  summarizeTrades,
  isClosedPosition,
} from "@/lib/trading/analytics";

const accountInclude = {
  accountSnapshot: true,
  accountReportResult: true,
  openPositions: {
    orderBy: [{ symbol: "asc" }, { positionNo: "asc" }],
  },
  positions: {
    orderBy: [{ closeTime: "asc" }, { positionNo: "asc" }],
  },
  deals: {
    orderBy: [{ time: "asc" }, { dealNo: "asc" }],
  },
} as const;

type AccountRecord = any;
type NumericLike = Prisma.Decimal | number;
type NullableNumericLike = NumericLike | null | undefined;
const BALANCE_SORT_EPSILON = 0.000001;

export interface AccountBundle {
  account: AccountRecord;
  latestSnapshot: AccountRecord["accountSnapshot"] | null;
}

function getLatestReportTimestamp(
  account: {
    reportDate?: Date | string | null;
    openPositions: Array<{ reportDate?: Date | string | null }>;
  },
  latestSnapshot: { reportDate?: Date | string | null } | null | undefined,
) {
  const reportTimestamps = [
    account.reportDate,
    latestSnapshot?.reportDate,
    ...account.openPositions.map((position) => position.reportDate),
  ]
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value));

  return reportTimestamps.length ? Math.max(...reportTimestamps) : null;
}

function toNullableNumber(value: NullableNumericLike) {
  const numeric = Number(value ?? Number.NaN);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNumber(value: NullableNumericLike, fallback = 0) {
  return toNullableNumber(value) ?? fallback;
}

function compareAccountListItems(a: SerializedAccount, b: SerializedAccount) {
  const balanceDelta = b.balance - a.balance;
  if (Math.abs(balanceDelta) > BALANCE_SORT_EPSILON) {
    return balanceDelta;
  }

  return a.account_number.localeCompare(b.account_number, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function serializeOpenPositions(
  openPositions: Array<{
    positionNo: string;
    openTime: Date | null;
    symbol: string;
    type: string;
    volume: number;
    price: NullableNumericLike;
    sl: NullableNumericLike;
    tp: NullableNumericLike;
    marketPrice: NullableNumericLike;
    profit: NullableNumericLike;
    swap: NullableNumericLike;
    comment: string | null;
  }>,
) {
  return [...openPositions]
    .sort((left, right) => {
      const leftTime = left.openTime ? new Date(left.openTime).getTime() : Number.NEGATIVE_INFINITY;
      const rightTime = right.openTime ? new Date(right.openTime).getTime() : Number.NEGATIVE_INFINITY;
      return rightTime - leftTime;
    })
    .map((position) => ({
      positionId: position.positionNo,
      openedAt: position.openTime,
      symbol: position.symbol,
      side: position.type,
      volume: position.volume,
      openPrice: Number(position.price),
      sl: position.sl == null ? null : Number(position.sl),
      tp: position.tp == null ? null : Number(position.tp),
      marketPrice: Number(position.marketPrice),
      floatingProfit: Number(position.profit),
      swap: Number(position.swap),
      comment: position.comment,
    }));
}

export function getAccountAnchorDate(bundle: AccountBundle, fallback = new Date()) {
  const { account, latestSnapshot } = bundle;
  const latestReportTimestamp = getLatestReportTimestamp(
    {
      reportDate: account.reportDate,
      openPositions: account.openPositions,
    },
    latestSnapshot,
  );
  return latestReportTimestamp ? new Date(latestReportTimestamp) : fallback;
}

export async function getAccountBundle(accountId: string): Promise<AccountBundle | null> {
  const account = await (prisma as any).tradingAccount.findUnique({
    where: {
      id: accountId,
    },
    include: accountInclude,
  });

  if (!account) {
    return null;
  }

  return {
    latestSnapshot: account.accountSnapshot,
    account,
  };
}

export function serializeAccountBundle(bundle: AccountBundle | null): SerializedAccount | null {
  if (!bundle) {
    return null;
  }

  const { account, latestSnapshot } = bundle;
  const openPositions = account.openPositions as Array<{
    reportDate?: Date | string | null;
    profit?: NullableNumericLike;
  }>;
  const latestReportTimestamp = getLatestReportTimestamp(
    {
      reportDate: account.reportDate,
      openPositions,
    },
    latestSnapshot,
  );

  return {
    id: account.id,
    account_number: account.accountNo,
    owner_name: sanitizeOptionalText(account.accountName),
    currency: sanitizeOptionalText(account.currency) ?? "USD",
    server: sanitizeOptionalText(account.serverName) ?? "",
    status: getAccountStatus(latestReportTimestamp ? new Date(latestReportTimestamp) : null),
    last_updated: latestReportTimestamp ? new Date(latestReportTimestamp) : null,
    balance: getLatestDealBalance(account.deals, latestSnapshot?.balance ?? 0),
    equity: toNumber(latestSnapshot?.equity, getLatestDealBalance(account.deals, 0)),
    floating_pl: toNumber(
      latestSnapshot?.floatingPl,
      openPositions.reduce((total, position) => total + Number(position.profit ?? 0), 0),
    ),
    margin: toNullableNumber(latestSnapshot?.margin),
    margin_level: latestSnapshot?.marginLevel ?? null,
  };
}

export async function getAccountListItems() {
  const accounts = await (prisma as any).tradingAccount.findMany({
    select: {
      id: true,
      accountNo: true,
      accountName: true,
      currency: true,
      serverName: true,
      reportDate: true,
      accountSnapshot: true,
      deals: {
        where: {
          balance: {
            not: null,
          },
        },
        orderBy: [{ time: "desc" }, { dealNo: "desc" }],
        take: 1,
        select: {
          time: true,
          dealNo: true,
          balance: true,
        },
      },
      openPositions: {
        select: {
          reportDate: true,
          profit: true,
        },
      },
    },
    orderBy: {
      accountNo: "asc",
    },
  });

  const items = accounts.map((account: any) => {
    const openPositions = account.openPositions as Array<{
      reportDate?: Date | string | null;
      profit?: NullableNumericLike;
    }>;
    const latestReportTimestamp = getLatestReportTimestamp(
      {
        reportDate: account.reportDate,
        openPositions,
      },
      account.accountSnapshot,
    );

    return {
      id: account.id,
      account_number: account.accountNo,
      owner_name: sanitizeOptionalText(account.accountName),
      currency: sanitizeOptionalText(account.currency) ?? "USD",
      server: sanitizeOptionalText(account.serverName) ?? "",
      status: getAccountStatus(latestReportTimestamp ? new Date(latestReportTimestamp) : null),
      balance: getLatestDealBalance(account.deals, account.accountSnapshot?.balance ?? 0),
      equity: toNumber(account.accountSnapshot?.equity, getLatestDealBalance(account.deals, 0)),
      floating_pl: toNumber(
        account.accountSnapshot?.floatingPl,
        openPositions.reduce((total, position) => total + Number(position.profit ?? 0), 0),
      ),
      margin: toNullableNumber(account.accountSnapshot?.margin),
      margin_level: account.accountSnapshot?.marginLevel ?? null,
      last_updated: latestReportTimestamp ? new Date(latestReportTimestamp) : null,
    } satisfies SerializedAccount;
  });

  return items.sort(compareAccountListItems);
}
