import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { SerializedAccount, Timeframe } from "@/lib/trading/types";

const EMPTY_TEXT_VALUES = new Set(["unknown", "n/a", "na", "--"]);

const reportInclude = {
  accountSummary: true,
  reportResults: true,
  dealLedger: {
    orderBy: {
      time: "asc",
    },
  },
  openPositions: true,
  workingOrders: true,
} satisfies Prisma.AccountReportInclude;

type AccountWithLatestReport = Prisma.AccountGetPayload<{
  include: {
    reports: {
      orderBy: {
        reportDate: "desc";
      };
      take: 1;
      include: typeof reportInclude;
    };
  };
}>;

export interface AccountBundle {
  account: AccountWithLatestReport;
  latestReport: AccountWithLatestReport["reports"][number] | null;
}

export function sanitizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return EMPTY_TEXT_VALUES.has(normalized.toLowerCase()) ? null : normalized;
}

export function parseTimeframe(value: string | null): Timeframe {
  switch (value) {
    case "day":
    case "week":
    case "month":
    case "year":
    case "all-time":
      return value;
    default:
      return "all-time";
  }
}

export function getSinceDate(timeframe: Timeframe, now = new Date()) {
  switch (timeframe) {
    case "day":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week": {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    default:
      return null;
  }
}

function getFreshestTimestamp(
  ...values: Array<Date | string | null | undefined>
) {
  const timestamps = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value));

  return timestamps.length ? Math.max(...timestamps) : null;
}

export function getAccountStatus(
  lastUpdated: Date | string | null | undefined,
  activeWindowMinutes = 15,
) {
  const timestamp = getFreshestTimestamp(lastUpdated);
  if (timestamp === null) {
    return "Inactive" as const;
  }

  return Date.now() - timestamp <= activeWindowMinutes * 60_000 ? "Active" : "Inactive";
}

export function filterBySince<T>(
  rows: T[],
  getTimestamp: (row: T) => Date | string,
  since: Date | null,
) {
  if (!since) {
    return rows;
  }

  const minimum = since.getTime();
  return rows.filter((row) => new Date(getTimestamp(row)).getTime() >= minimum);
}

export function dealNet(row: {
  profit?: number | null;
  commission?: number | null;
  swap?: number | null;
}) {
  return Number(row.profit ?? 0) + Number(row.commission ?? 0) + Number(row.swap ?? 0);
}

export function dealProfit(row: { profit?: number | null }) {
  return Number(row.profit ?? 0);
}

function normalizeDealType(type: string | null | undefined) {
  return typeof type === "string" ? type.trim().toLowerCase() : "";
}

export function isBalanceDeal(type: string | null | undefined) {
  return normalizeDealType(type).includes("balance");
}

export function isFundingDeal(type: string | null | undefined) {
  const normalized = normalizeDealType(type);
  if (!normalized) {
    return false;
  }

  return [
    "balance",
    "deposit",
    "withdraw",
    "withdrawal",
    "credit",
    "bonus",
    "commission",
    "fee",
    "charge",
    "correction",
    "interest",
    "tax",
    "agent",
    "dividend",
  ].some((token) => normalized.includes(token));
}

export function isTradingDeal(type: string | null | undefined) {
  const normalized = normalizeDealType(type);
  if (!normalized || isFundingDeal(normalized)) {
    return false;
  }

  return normalized.includes("buy") || normalized.includes("sell");
}

export function getLatestDealBalance(
  deals: Array<{ time: Date | string; dealId?: string; balanceAfter?: number | null }>,
  fallback = 0,
) {
  const latest = sortDeals(deals).reduce<{ balanceAfter?: number | null } | null>((current, deal) => {
    const balanceAfter = Number(deal.balanceAfter ?? Number.NaN);
    if (!Number.isFinite(balanceAfter)) {
      return current;
    }

    return deal;
  }, null);

  return latest ? Number(latest.balanceAfter) : fallback;
}

type DealBalanceRow = {
  time: Date | string;
  dealId?: string;
  type?: string | null;
  profit?: number | null;
  commission?: number | null;
  swap?: number | null;
  balanceAfter?: number | null;
};

type ReportResultsRow = {
  totalTrades?: number | null;
  shortTradesWon?: number | null;
  shortTradesTotal?: number | null;
  longTradesWon?: number | null;
  longTradesTotal?: number | null;
  profitTradesCount?: number | null;
  lossTradesCount?: number | null;
  profitFactor?: number | null;
  expectedPayoff?: number | null;
  recoveryFactor?: number | null;
  sharpeRatio?: number | null;
  balanceDrawdownAbsolute?: number | null;
  balanceDrawdownMaximal?: number | null;
  balanceDrawdownMaximalPct?: number | null;
  balanceDrawdownRelativePct?: number | null;
  balanceDrawdownRelative?: number | null;
};

function sortDeals<T extends { time: Date | string; dealId?: string }>(deals: T[]) {
  return [...deals].sort((left, right) => {
    const delta = new Date(left.time).getTime() - new Date(right.time).getTime();
    if (delta !== 0) {
      return delta;
    }

    return String(left.dealId ?? "").localeCompare(String(right.dealId ?? ""));
  });
}

function deriveStartingBalanceFromDeal(deal: {
  type?: string | null;
  profit?: number | null;
  commission?: number | null;
  swap?: number | null;
  balanceAfter?: number | null;
}) {
  const balanceAfter = Number(deal.balanceAfter ?? Number.NaN);
  const delta = dealNet(deal);
  const starting = balanceAfter - delta;
  return Number.isFinite(starting) ? starting : 0;
}

function collectDealWindow(deals: DealBalanceRow[], start: Date | null, end: Date | null = null) {
  const sorted = sortDeals(deals);
  if (!sorted.length) {
    return {
      sorted,
      window: [] as DealBalanceRow[],
      startBalance: 0,
      endBalance: 0,
    };
  }

  const startTimestamp = start ? start.getTime() : null;
  const endTimestamp = end ? end.getTime() : null;

  let runningBalance = deriveStartingBalanceFromDeal(sorted[0]);
  let startBalance = runningBalance;
  const window: DealBalanceRow[] = [];

  for (const deal of sorted) {
    const timestamp = new Date(deal.time).getTime();
    const balanceAfter = Number(deal.balanceAfter ?? Number.NaN);

    if (startTimestamp !== null && timestamp < startTimestamp) {
      runningBalance = Number.isFinite(balanceAfter) ? balanceAfter : runningBalance;
      startBalance = runningBalance;
      continue;
    }

    if (endTimestamp !== null && timestamp > endTimestamp) {
      break;
    }

    if (window.length === 0) {
      startBalance = runningBalance;
    }

    window.push(deal);
    runningBalance = Number.isFinite(balanceAfter) ? balanceAfter : runningBalance;
  }

  const endBalance = window.length
    ? Number(window[window.length - 1].balanceAfter ?? runningBalance)
    : startBalance;

  return {
    sorted,
    window,
    startBalance,
    endBalance: Number.isFinite(endBalance) ? endBalance : startBalance,
  };
}

export function computeCompoundedGrowth(
  deals: DealBalanceRow[],
  start: Date | null,
  end: Date | null = null,
) {
  const { window, startBalance } = collectDealWindow(deals, start, end);
  if (!window.length || !Number.isFinite(startBalance)) {
    return 0;
  }

  let growthFactor = 1;
  let periodStartBalance = startBalance;
  let previousBalance = startBalance;

  for (const deal of window) {
    const balanceAfter = Number(deal.balanceAfter ?? Number.NaN);
    if (!Number.isFinite(balanceAfter)) {
      continue;
    }

    if (isFundingDeal(deal.type)) {
      if (periodStartBalance > 0) {
        growthFactor *= previousBalance / periodStartBalance;
      }

      periodStartBalance = balanceAfter;
    }

    previousBalance = balanceAfter;
  }

  if (periodStartBalance > 0) {
    growthFactor *= previousBalance / periodStartBalance;
  }

  const growth = (growthFactor - 1) * 100;
  if (!Number.isFinite(growth)) {
    return 0;
  }
  return growth;
}

export function computeAbsoluteGain(
  deals: DealBalanceRow[],
  start: Date | null,
  end: Date | null = null,
) {
  const { window, startBalance, endBalance } = collectDealWindow(deals, start, end);
  if (!window.length) {
    return 0;
  }

  const fundingDelta = window.reduce((total, deal) => {
    if (!isFundingDeal(deal.type)) {
      return total;
    }

    return total + dealNet(deal);
  }, 0);

  const deposited = window.reduce((total, deal) => {
    if (!isFundingDeal(deal.type)) {
      return total;
    }

    const delta = dealNet(deal);
    return delta > 0 ? total + delta : total;
  }, 0);

  const profit = endBalance - startBalance - fundingDelta;
  const capitalBase = deposited > 0 ? deposited : startBalance > 0 ? startBalance : 0;
  if (capitalBase <= 0) {
    return 0;
  }

  const absoluteGain = (profit / capitalBase) * 100;
  return Number.isFinite(absoluteGain) ? absoluteGain : 0;
}

export function computeStreaks(values: number[]) {
  let bestWinStreak = 0;
  let worstLossStreak = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const value of values) {
    if (value > 0) {
      currentWins += 1;
      currentLosses = 0;
    } else if (value < 0) {
      currentLosses += 1;
      currentWins = 0;
    } else {
      currentWins = 0;
      currentLosses = 0;
    }

    bestWinStreak = Math.max(bestWinStreak, currentWins);
    worstLossStreak = Math.max(worstLossStreak, currentLosses);
  }

  return { bestWinStreak, worstLossStreak };
}

function toFiniteNumber(value: number | null | undefined) {
  return Number.isFinite(value ?? Number.NaN) ? Number(value) : null;
}

function toIsoDay(value: Date | string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function getReportWinPercent(reportResults: ReportResultsRow | null | undefined) {
  const wins = Number(reportResults?.profitTradesCount ?? 0);
  const losses = Number(reportResults?.lossTradesCount ?? 0);
  const explicitTotal = Number(reportResults?.totalTrades ?? Number.NaN);
  const total = Number.isFinite(explicitTotal) && explicitTotal > 0 ? explicitTotal : wins + losses;
  return total > 0 ? (wins / total) * 100 : 0;
}

export function getLongTradeWinPercent(reportResults: ReportResultsRow | null | undefined) {
  const wins = Number(reportResults?.longTradesWon ?? 0);
  const total = Number(reportResults?.longTradesTotal ?? 0);
  return total > 0 ? (wins / total) * 100 : null;
}

export function getShortTradeWinPercent(reportResults: ReportResultsRow | null | undefined) {
  const wins = Number(reportResults?.shortTradesWon ?? 0);
  const total = Number(reportResults?.shortTradesTotal ?? 0);
  return total > 0 ? (wins / total) * 100 : null;
}

export function getPrimaryDrawdownPercent(reportResults: ReportResultsRow | null | undefined) {
  return toFiniteNumber(reportResults?.balanceDrawdownMaximalPct)
    ?? toFiniteNumber(reportResults?.balanceDrawdownRelativePct)
    ?? 0;
}

export function buildDailyProfitSeries(
  deals: Array<{ time: Date | string; type?: string | null; profit?: number | null; commission?: number | null; swap?: number | null }>,
  days = 5,
  now = new Date(),
) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const dayKeys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(end);
    cursor.setDate(end.getDate() - offset);
    dayKeys.push(cursor.toISOString().slice(0, 10));
  }

  const totals = new Map(dayKeys.map((key) => [key, 0]));
  for (const deal of deals) {
    if (!isTradingDeal(deal.type)) {
      continue;
    }

    const day = toIsoDay(deal.time);
    if (!day || !totals.has(day)) {
      continue;
    }

    totals.set(day, Number(totals.get(day) ?? 0) + dealNet(deal));
  }

  return dayKeys.map((date) => ({
    date,
    profit: Number(totals.get(date) ?? 0),
  }));
}

export function buildSymbolTradePercent(
  deals: Array<{ symbol?: string | null; type?: string | null }>,
) {
  const counts = new Map<string, number>();
  let total = 0;

  for (const deal of deals) {
    if (!isTradingDeal(deal.type)) {
      continue;
    }

    const symbol = sanitizeOptionalText(deal.symbol) ?? "UNKNOWN";
    counts.set(symbol, Number(counts.get(symbol) ?? 0) + 1);
    total += 1;
  }

  if (total === 0) {
    return [] as Array<{ symbol: string; percent: number }>;
  }

  return [...counts.entries()]
    .map(([symbol, count]) => ({
      symbol,
      percent: (count / total) * 100,
    }))
    .sort((left, right) => right.percent - left.percent || left.symbol.localeCompare(right.symbol));
}

export function buildBalanceEquityCurve(
  deals: Array<{ time: Date | string; type?: string | null; profit?: number | null; commission?: number | null; swap?: number | null; balanceAfter?: number | null; dealId?: string }>,
  _openPositions: Array<{ floatingProfit?: number | null; floating_profit?: number | null }>,
) {
  let lastKnownBalance: number | null = null;

  return sortDeals(deals)
    .map((deal) => {
      const parsedBalance = Number(deal.balanceAfter ?? Number.NaN);
      if (Number.isFinite(parsedBalance)) {
        lastKnownBalance = parsedBalance;
      }

      if (!Number.isFinite(lastKnownBalance ?? Number.NaN)) {
        return null;
      }

      const balance = Number(lastKnownBalance);
      return {
        time: deal.time,
        balance,
        // Historic equity snapshots are not available per deal event; keep the curve tied to the deal balance.
        equity: balance,
        eventType: deal.type ?? null,
        eventDelta: dealNet(deal),
      };
    })
    .filter((point): point is { time: Date | string; balance: number; equity: number; eventType: string | null; eventDelta: number } => point !== null);
}

export function buildUnitDrawdownCurve(
  deals: DealBalanceRow[],
  _openPositions: Array<{ floatingProfit?: number | null; floating_profit?: number | null }>,
) {
  const sorted = sortDeals(deals).filter((deal) => isTradingDeal(deal.type));

  if (!sorted.length) {
    return [];
  }

  const output: Array<{
    time: Date;
    equity: number;
    unitValue: number;
    highWaterMark: number;
    drawdownPercent: number;
  }> = [];

  let highWaterMark = Number.NEGATIVE_INFINITY;

  sorted.forEach((deal) => {
    const balanceAfter = Number(deal.balanceAfter ?? Number.NaN);
    const equity = balanceAfter;
    if (!Number.isFinite(equity)) {
      return;
    }

    if (!Number.isFinite(highWaterMark)) {
      highWaterMark = equity;
    }

    highWaterMark = Math.max(highWaterMark, equity);
    const drawdownPercent = highWaterMark > 0 ? ((highWaterMark - equity) / highWaterMark) * 100 : 0;

    output.push({
      time: new Date(deal.time),
      equity,
      unitValue: equity,
      highWaterMark,
      drawdownPercent,
    });
  });

  return output;
}

export function calculateMaxDrawdown(
  deals: DealBalanceRow[],
  openPositions: Array<{ floatingProfit?: number | null; floating_profit?: number | null }>,
) {
  const drawdownSeries = buildUnitDrawdownCurve(deals, openPositions);
  if (!drawdownSeries.length) {
    return 0;
  }

  return drawdownSeries.reduce((maximum, point) => Math.max(maximum, point.drawdownPercent), 0);
}

export function computeBalanceDrawdown(
  deals: DealBalanceRow[],
  endingBalance: number,
) {
  if (!deals.length) {
    return {
      amount: 0,
      percent: 0,
      peakBalance: endingBalance,
      troughBalance: endingBalance,
    };
  }

  let runningPeak = Number.NEGATIVE_INFINITY;
  let peakBalance = endingBalance;
  let troughBalance = endingBalance;
  let amount = 0;
  let percent = 0;

  for (const deal of sortDeals(deals).filter((item) => isTradingDeal(item.type))) {
    const balance = Number(deal.balanceAfter ?? Number.NaN);
    if (!Number.isFinite(balance)) {
      continue;
    }

    if (!Number.isFinite(runningPeak) || balance > runningPeak) {
      runningPeak = balance;
    }

    const currentAmount = runningPeak - balance;
    const currentPercent = runningPeak > 0 ? (currentAmount / runningPeak) * 100 : 0;
    if (currentPercent > percent) {
      percent = currentPercent;
      amount = currentAmount;
      peakBalance = runningPeak;
      troughBalance = balance;
    }
  }

  return {
    amount,
    percent,
    peakBalance,
    troughBalance,
  };
}

export function computeAllTimeGrowth(
  deals: DealBalanceRow[],
  _currentBalance?: number,
) {
  return computeCompoundedGrowth(deals, null, null);
}

export function computeYearGrowth(
  deals: DealBalanceRow[],
  year: number,
  _currentBalance?: number,
) {
  return computeCompoundedGrowth(
    deals,
    new Date(year, 0, 1, 0, 0, 0, 0),
    new Date(year, 11, 31, 23, 59, 59, 999),
  );
}

export function summarizeTrades(
  deals: Array<{ type?: string | null; profit?: number | null; commission?: number | null; swap?: number | null }>,
) {
  const tradingDeals = deals.filter((deal) => isTradingDeal(deal.type));
  const trades = tradingDeals.length;
  const wins = tradingDeals.filter((trade) => dealNet(trade) > 0).length;

  return {
    trades,
    winPercent: trades > 0 ? (wins / trades) * 100 : 0,
    netProfit: deals.reduce((total, deal) => total + (isTradingDeal(deal.type) ? dealNet(deal) : 0), 0),
  };
}

export async function getAccountBundle(accountId: string): Promise<AccountBundle | null> {
  const account = await prisma.account.findUnique({
    where: {
      id: accountId,
    },
    include: {
      reports: {
        orderBy: {
          reportDate: "desc",
        },
        take: 1,
        include: reportInclude,
      },
    },
  });

  if (!account) {
    return null;
  }

  return {
    account,
    latestReport: account.reports[0] ?? null,
  };
}

export function serializeAccountBundle(bundle: AccountBundle | null): SerializedAccount | null {
  if (!bundle) {
    return null;
  }

  const { account, latestReport } = bundle;
  const summary = latestReport?.accountSummary;
  const freshestUpdate = latestReport ? getFreshestTimestamp(latestReport.reportDate) : null;

  return {
    id: account.id,
    account_number: account.accountNumber,
    owner_name: sanitizeOptionalText(account.ownerName),
    currency: sanitizeOptionalText(account.currency) ?? "USD",
    server: sanitizeOptionalText(account.server) ?? "",
    status: getAccountStatus(latestReport?.reportDate),
    last_updated: freshestUpdate ? new Date(freshestUpdate) : null,
    balance: latestReport ? getLatestDealBalance(latestReport.dealLedger, summary?.balance ?? 0) : (summary?.balance ?? 0),
    equity: summary?.equity ?? 0,
    floating_pl: summary?.floatingPl ?? 0,
    margin_level: summary?.marginLevel ?? null,
  };
}

export async function getAccountListItems() {
  const accounts = await prisma.account.findMany({
    include: {
      reports: {
        orderBy: {
          reportDate: "desc",
        },
        take: 1,
        include: {
          accountSummary: true,
          reportResults: true,
          dealLedger: {
            orderBy: {
              time: "asc",
            },
          },
        },
      },
    },
    orderBy: {
      accountNumber: "asc",
    },
  });

  return accounts.map((account) => {
    const latestReport = account.reports[0];
    const summary = latestReport?.accountSummary;
    const freshestUpdate = latestReport ? getFreshestTimestamp(latestReport.reportDate) : null;

    return {
      id: account.id,
      account_number: account.accountNumber,
      owner_name: sanitizeOptionalText(account.ownerName),
      currency: sanitizeOptionalText(account.currency) ?? "USD",
      server: sanitizeOptionalText(account.server) ?? "",
      status: getAccountStatus(latestReport?.reportDate),
      balance: latestReport ? getLatestDealBalance(latestReport.dealLedger, summary?.balance ?? 0) : (summary?.balance ?? 0),
      equity: summary?.equity ?? 0,
      floating_pl: summary?.floatingPl ?? 0,
      margin_level: summary?.marginLevel ?? null,
      last_updated: freshestUpdate ? new Date(freshestUpdate) : null,
    } satisfies SerializedAccount;
  });
}
