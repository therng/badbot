import type { Timeframe } from "@/lib/trading/types";

type NumericLike = number | { valueOf(): unknown } | null | undefined;

type TimedRow = {
  time: Date | string;
  dealId?: string;
  dealNo?: string;
};

type BalanceRow = TimedRow & {
  type?: string | null;
  direction?: string | null;
  profit?: NumericLike;
  commission?: NumericLike;
  swap?: NumericLike;
  balanceAfter?: NumericLike;
  balance?: NumericLike;
};

const EMPTY_TEXT_VALUES = new Set(["unknown", "n/a", "na", "--"]);
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function getDealSortKey(row: { dealId?: string; dealNo?: string }) {
  return String(row.dealId ?? row.dealNo ?? "");
}

function sortDeals<T extends TimedRow>(deals: T[]) {
  return [...deals].sort((left, right) => {
    const delta = new Date(left.time).getTime() - new Date(right.time).getTime();
    if (delta !== 0) {
      return delta;
    }

    return getDealSortKey(left).localeCompare(getDealSortKey(right));
  });
}

function getDealBalanceValue(row: { balanceAfter?: NumericLike; balance?: NumericLike }) {
  const value = Number(row.balanceAfter ?? row.balance ?? Number.NaN);
  return Number.isFinite(value) ? value : null;
}

function deriveStartingBalanceFromDeal(deal: BalanceRow) {
  const balanceAfter = getDealBalanceValue(deal);
  if (balanceAfter === null) {
    return 0;
  }

  const starting = balanceAfter - dealNet(deal);
  return Number.isFinite(starting) ? starting : 0;
}

function collectDealWindow(deals: BalanceRow[], start: Date | null, end: Date | null = null) {
  const sorted = sortDeals(deals);
  if (!sorted.length) {
    return {
      sorted,
      window: [] as BalanceRow[],
      startBalance: 0,
      endBalance: 0,
    };
  }

  const startTimestamp = start ? start.getTime() : null;
  const endTimestamp = end ? end.getTime() : null;

  let runningBalance = deriveStartingBalanceFromDeal(sorted[0]);
  let startBalance = runningBalance;
  const window: BalanceRow[] = [];

  for (const deal of sorted) {
    const timestamp = new Date(deal.time).getTime();
    const balanceAfter = getDealBalanceValue(deal);

    if (startTimestamp !== null && timestamp < startTimestamp) {
      runningBalance = balanceAfter ?? runningBalance;
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
    runningBalance = balanceAfter ?? runningBalance;
  }

  const endBalance = window.length
    ? getDealBalanceValue(window[window.length - 1]) ?? runningBalance
    : startBalance;

  return {
    sorted,
    window,
    startBalance,
    endBalance: Number.isFinite(endBalance) ? endBalance : startBalance,
  };
}

function toIsoDay(value: Date | string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeDealType(type: string | null | undefined) {
  return typeof type === "string" ? type.trim().toLowerCase() : "";
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
    case "1d":
    case "day":
      return "1d";
    case "5d":
    case "week":
      return "5d";
    case "1m":
    case "month":
      return "1m";
    case "3m":
      return "3m";
    case "6m":
      return "6m";
    case "1y":
    case "year":
      return "1y";
    case "all":
    case "all-time":
      return "all";
    default:
      return "all";
  }
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function getSinceDate(timeframe: Timeframe, now = new Date()) {
  switch (timeframe) {
    case "1d":
      return startOfDay(now);
    case "5d": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 4);
      return start;
    }
    case "1m":
      return startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    case "3m":
      return startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90));
    case "6m":
      return startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 180));
    case "1y":
      return startOfDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
    default:
      return null;
  }
}

export function getTimeframeLabel(timeframe: Timeframe) {
  switch (timeframe) {
    case "1d":
      return "1D";
    case "5d":
      return "5D";
    case "1m":
      return "1M";
    case "3m":
      return "3M";
    case "6m":
      return "6M";
    case "1y":
      return "1Y";
    default:
      return "ALL";
  }
}

export function getAccountStatus(
  lastUpdated: Date | string | null | undefined,
  activeWindowMinutes = 15,
) {
  const timestamp = lastUpdated ? new Date(lastUpdated).getTime() : Number.NaN;
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + MAX_FUTURE_SKEW_MS) {
    return "Inactive" as const;
  }

  return Date.now() - timestamp <= activeWindowMinutes * 60_000 ? "Active" as const : "Inactive" as const;
}

export function filterBySince<T>(
  rows: T[],
  getTimestamp: (row: T) => Date | string | null | undefined,
  since: Date | null,
) {
  if (!since) {
    return rows;
  }

  const minimum = since.getTime();
  return rows.filter((row) => {
    const value = getTimestamp(row);
    return value ? new Date(value).getTime() >= minimum : false;
  });
}

export function filterByDateRange<T>(
  rows: T[],
  getTimestamp: (row: T) => Date | string | null | undefined,
  start: Date | null,
  end: Date | null = null,
) {
  const min = start ? start.getTime() : null;
  const max = end ? end.getTime() : null;

  return rows.filter((row) => {
    const value = getTimestamp(row);
    if (!value) {
      return false;
    }

    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) {
      return false;
    }

    if (min !== null && timestamp < min) {
      return false;
    }

    if (max !== null && timestamp > max) {
      return false;
    }

    return true;
  });
}

export function dealNet(row: { profit?: NumericLike; commission?: NumericLike; swap?: NumericLike }) {
  return Number(row.profit ?? 0) + Number(row.commission ?? 0) + Number(row.swap ?? 0);
}

export function normalizeTradeSide(type: string | null | undefined, direction: string | null | undefined) {
  const normalizedType = normalizeDealType(type);
  if (normalizedType === "buy" || normalizedType === "sell") {
    return normalizedType;
  }

  const normalizedDirection = normalizeDealType(direction);
  if (normalizedDirection === "buy" || normalizedDirection === "sell") {
    return normalizedDirection;
  }

  return normalizedType || normalizedDirection || "unknown";
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
  deals: Array<{ time: Date | string; dealId?: string; dealNo?: string; balanceAfter?: NumericLike; balance?: NumericLike }>,
  fallback: NumericLike = 0,
) {
  const latest = sortDeals(deals).reduce<number | null>((current, deal) => {
    const balanceAfter = getDealBalanceValue(deal);
    return balanceAfter === null ? current : balanceAfter;
  }, null);

  return latest ?? Number(fallback ?? 0);
}

export function computeCompoundedGrowth(
  deals: BalanceRow[],
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
    const balanceAfter = getDealBalanceValue(deal);
    if (balanceAfter === null) {
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
  return Number.isFinite(growth) ? growth : 0;
}

export function computeAbsoluteGain(
  deals: BalanceRow[],
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

export function computeSharpeRatio(values: number[]) {
  if (values.length < 2) {
    return null;
  }

  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  const deviation = Math.sqrt(variance);
  if (!Number.isFinite(deviation) || deviation === 0) {
    return null;
  }

  const sharpe = average / deviation;
  return Number.isFinite(sharpe) ? sharpe : null;
}

export function computeAverageHoldHours(
  rows: Array<{ openTime?: Date | string | null; closeTime?: Date | string | null }>,
) {
  const spans = rows
    .map((row) => {
      if (!row.openTime || !row.closeTime) {
        return null;
      }

      const opened = new Date(row.openTime).getTime();
      const closed = new Date(row.closeTime).getTime();
      if (!Number.isFinite(opened) || !Number.isFinite(closed) || closed <= opened) {
        return null;
      }

      return (closed - opened) / 3_600_000;
    })
    .filter((value): value is number => value !== null);

  if (!spans.length) {
    return null;
  }

  const average = spans.reduce((total, value) => total + value, 0) / spans.length;
  return Number.isFinite(average) ? average : null;
}

export function computeConsecutiveRunAmounts(values: number[]) {
  let currentProfit = 0;
  let currentLoss = 0;
  let maxProfit = 0;
  let maxLoss = 0;

  for (const value of values) {
    if (value > 0) {
      currentProfit += value;
      currentLoss = 0;
    } else if (value < 0) {
      currentLoss += Math.abs(value);
      currentProfit = 0;
    } else {
      currentProfit = 0;
      currentLoss = 0;
    }

    maxProfit = Math.max(maxProfit, currentProfit);
    maxLoss = Math.max(maxLoss, currentLoss);
  }

  return {
    maxConsecutiveProfitAmount: maxProfit > 0 ? maxProfit : null,
    maxConsecutiveLossAmount: maxLoss > 0 ? maxLoss : null,
  };
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

export function isClosedPosition(row: { closeTime?: Date | string | null }) {
  if (!row.closeTime) {
    return false;
  }

  return Number.isFinite(new Date(row.closeTime).getTime());
}

export function positionProfit(row: { profit?: NumericLike }) {
  const value = Number(row.profit ?? Number.NaN);
  return Number.isFinite(value) ? value : null;
}

export function summarizeClosedPositions(
  rows: Array<{ closeTime?: Date | string | null; type?: string | null; profit?: NumericLike }>,
) {
  const closedPositions = rows
    .filter((row) => isClosedPosition(row))
    .map((row) => ({
      ...row,
      closeTimestamp: new Date(row.closeTime as Date | string).getTime(),
      profitValue: positionProfit(row),
      side: normalizeTradeSide(row.type, row.type),
    }))
    .filter(
      (
        row,
      ): row is {
        closeTime?: Date | string | null;
        type?: string | null;
        profit?: NumericLike;
        closeTimestamp: number;
        profitValue: number;
        side: string;
      } => Number.isFinite(row.closeTimestamp) && row.profitValue !== null,
    )
    .sort((left, right) => left.closeTimestamp - right.closeTimestamp);

  const profits = closedPositions.map((row) => row.profitValue);
  const totalTrades = profits.length;
  const profitTradesCount = profits.filter((value) => value > 0).length;
  const lossTradesCount = profits.filter((value) => value < 0).length;
  const totalNetProfit = profits.reduce((total, value) => total + value, 0);
  const grossProfit = profits.filter((value) => value > 0).reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(profits.filter((value) => value < 0).reduce((total, value) => total + value, 0));
  const longTrades = closedPositions.filter((row) => row.side === "buy");
  const shortTrades = closedPositions.filter((row) => row.side === "sell");
  const streaks = computeStreaks(profits);

  return {
    totalTrades,
    totalNetProfit,
    winPercent: totalTrades ? (profitTradesCount / totalTrades) * 100 : 0,
    profitTradesCount,
    lossTradesCount,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    expectedPayoff: totalTrades > 0 ? totalNetProfit / totalTrades : null,
    largestProfitTrade: profitTradesCount > 0 ? Math.max(...profits) : null,
    largestLossTrade: lossTradesCount > 0 ? Math.min(...profits) : null,
    averageProfitTrade: profitTradesCount > 0 ? grossProfit / profitTradesCount : null,
    averageLossTrade: lossTradesCount > 0 ? grossLoss / lossTradesCount : null,
    longTradesTotal: longTrades.length,
    longTradesWon: longTrades.filter((row) => row.profitValue > 0).length,
    shortTradesTotal: shortTrades.length,
    shortTradesWon: shortTrades.filter((row) => row.profitValue > 0).length,
    maximumConsecutiveWins: totalTrades > 0 ? streaks.bestWinStreak : null,
    maximumConsecutiveLosses: totalTrades > 0 ? streaks.worstLossStreak : null,
  };
}

export function getTradeWinPercent(
  deals: Array<{ type?: string | null; profit?: NumericLike; commission?: NumericLike; swap?: NumericLike }>,
) {
  const trades = deals.filter((deal) => isTradingDeal(deal.type));
  if (!trades.length) {
    return 0;
  }

  const wins = trades.filter((trade) => dealNet(trade) > 0).length;
  return (wins / trades.length) * 100;
}

export function getLongTradeWinPercent(
  deals: Array<{ type?: string | null; direction?: string | null; profit?: NumericLike; commission?: NumericLike; swap?: NumericLike }>,
) {
  const trades = deals.filter(
    (deal) => isTradingDeal(deal.type) && normalizeTradeSide(deal.type, deal.direction) === "buy",
  );

  if (!trades.length) {
    return null;
  }

  const wins = trades.filter((trade) => dealNet(trade) > 0).length;
  return (wins / trades.length) * 100;
}

export function getShortTradeWinPercent(
  deals: Array<{ type?: string | null; direction?: string | null; profit?: NumericLike; commission?: NumericLike; swap?: NumericLike }>,
) {
  const trades = deals.filter(
    (deal) => isTradingDeal(deal.type) && normalizeTradeSide(deal.type, deal.direction) === "sell",
  );

  if (!trades.length) {
    return null;
  }

  const wins = trades.filter((trade) => dealNet(trade) > 0).length;
  return (wins / trades.length) * 100;
}

export function buildDailyProfitSeries(
  deals: Array<{ time: Date | string; type?: string | null; profit?: NumericLike; commission?: NumericLike; swap?: NumericLike }>,
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

export function buildFundingTotals(
  deals: Array<{ type?: string | null; profit?: NumericLike; commission?: NumericLike; swap?: NumericLike }>,
) {
  return deals.reduce(
    (totals, deal) => {
      if (!isFundingDeal(deal.type)) {
        return totals;
      }

      const delta = dealNet(deal);
      if (!Number.isFinite(delta) || delta === 0) {
        return totals;
      }

      if (delta > 0) {
        totals.totalDeposit += delta;
      } else {
        totals.totalWithdraw += Math.abs(delta);
      }

      return totals;
    },
    { totalDeposit: 0, totalWithdraw: 0 },
  );
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

export function buildBalanceCurve(
  deals: Array<{
    time: Date | string;
    type?: string | null;
    profit?: NumericLike;
    commission?: NumericLike;
    swap?: NumericLike;
    balanceAfter?: NumericLike;
    balance?: NumericLike;
    dealId?: string;
    dealNo?: string;
  }>,
  _openPositions: Array<{ floatingProfit?: NumericLike; floating_profit?: NumericLike; profit?: NumericLike }>,
) {
  let lastKnownBalance: number | null = null;

  return sortDeals(deals)
    .map((deal) => {
      const parsedBalance = getDealBalanceValue(deal);
      if (parsedBalance !== null) {
        lastKnownBalance = parsedBalance;
      }

      if (!Number.isFinite(lastKnownBalance ?? Number.NaN)) {
        return null;
      }

      const balance = Number(lastKnownBalance);
      return {
        time: deal.time,
        balance,
        eventType: deal.type ?? null,
        eventDelta: dealNet(deal),
      };
    })
    .filter((point): point is { time: Date | string; balance: number; eventType: string | null; eventDelta: number } => point !== null);
}

export function buildUnitDrawdownCurve(
  deals: BalanceRow[],
  _openPositions: Array<{ floatingProfit?: NumericLike; floating_profit?: NumericLike; profit?: NumericLike }>,
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
    const equity = getDealBalanceValue(deal);
    if (equity === null) {
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

export function computeBalanceDrawdown(deals: BalanceRow[], endingBalance: NumericLike) {
  const resolvedEndingBalance = Number(endingBalance ?? 0);
  if (!deals.length) {
    return {
      amount: 0,
      percent: 0,
      peakBalance: resolvedEndingBalance,
      troughBalance: resolvedEndingBalance,
    };
  }

  let runningPeak = Number.NEGATIVE_INFINITY;
  let peakBalance = resolvedEndingBalance;
  let troughBalance = resolvedEndingBalance;
  let amount = 0;
  let percent = 0;

  for (const deal of sortDeals(deals).filter((item) => isTradingDeal(item.type))) {
    const balance = getDealBalanceValue(deal);
    if (balance === null) {
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

export function computeAllTimeGrowth(deals: BalanceRow[]) {
  return computeCompoundedGrowth(deals, null, null);
}

export function computeYearGrowth(deals: BalanceRow[], year: number) {
  return computeCompoundedGrowth(
    deals,
    new Date(year, 0, 1, 0, 0, 0, 0),
    new Date(year, 11, 31, 23, 59, 59, 999),
  );
}

export function summarizeTrades(
  deals: Array<{ type?: string | null; profit?: NumericLike; commission?: NumericLike; swap?: NumericLike }>,
) {
  const tradingDeals = deals.filter((deal) => isTradingDeal(deal.type));
  const trades = tradingDeals.length;
  const wins = tradingDeals.filter((trade) => dealNet(trade) > 0).length;

  return {
    trades,
    winPercent: trades > 0 ? (wins / trades) * 100 : 0,
    netProfit: tradingDeals.reduce((total, deal) => total + dealNet(deal), 0),
  };
}
