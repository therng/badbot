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
  comment?: string | null;
  profit?: NumericLike;
  commission?: NumericLike;
  swap?: NumericLike;
  balanceAfter?: NumericLike;
  balance?: NumericLike;
};

type PositionMetricRow = {
  closeTime?: Date | string | null;
  outTime?: Date | string | null;
  openTime?: Date | string | null;
  inTime?: Date | string | null;
  positionNo?: string | null;
  positionId?: string | null;
  type?: string | null;
  direction?: string | null;
  profit?: NumericLike;
  commission?: NumericLike;
  swap?: NumericLike;
};

const EMPTY_TEXT_VALUES = new Set(["unknown", "n/a", "na", "--"]);
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function getDealSortKey(row: { dealId?: string; dealNo?: string }) {
  return String(row.dealId ?? row.dealNo ?? "");
}

function getPositionSortKey(row: { positionNo?: string | null; positionId?: string | null }) {
  return String(row.positionNo ?? row.positionId ?? "");
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

type TradingBalancePoint = {
  time: Date | string;
  balance: number;
  delta: number;
  type: string | null;
  comment: string | null;
};

type BalanceOperationKind = "deposit" | "withdrawal" | "balance-adjustment" | "balance";

const GENERIC_BALANCE_OPERATION_KEYWORDS = [
  "credit",
  "correction",
  "bonus",
  "fee",
  "charge",
  "interest",
  "tax",
  "agent",
  "dividend",
];

function normalizeDealComment(comment: string | null | undefined) {
  return typeof comment === "string" ? comment.replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function buildDealSearchText(type: string | null | undefined, comment: string | null | undefined) {
  return [normalizeDealType(type), normalizeDealComment(comment)].filter(Boolean).join(" ");
}

function classifyBalanceOperation(
  type: string | null | undefined,
  comment: string | null | undefined,
  delta: number | null = null,
): BalanceOperationKind | null {
  const normalizedType = normalizeDealType(type);
  const normalizedComment = normalizeDealComment(comment);
  const searchText = buildDealSearchText(type, comment);

  if (!normalizedType && !normalizedComment) {
    return null;
  }

  if (searchText.includes("deposit")) {
    return "deposit";
  }

  if (searchText.includes("withdraw")) {
    return "withdrawal";
  }

  if (
    searchText.includes("balance adjustment")
    || (normalizedType === "balance" && normalizedComment.includes("adjustment"))
  ) {
    return "balance-adjustment";
  }

  if (GENERIC_BALANCE_OPERATION_KEYWORDS.some((token) => searchText.includes(token))) {
    return "balance";
  }

  if (normalizedType === "balance") {
    if ((delta ?? 0) > 0) {
      return "deposit";
    }

    if ((delta ?? 0) < 0) {
      return "withdrawal";
    }

    return "balance";
  }

  return null;
}

function isTradeMetricDeal(type: string | null | undefined, comment: string | null | undefined) {
  return Boolean(normalizeDealType(type) || normalizeDealComment(comment))
    && classifyBalanceOperation(type, comment) === null;
}

function resolveInitialDeposit(sortedDeals: BalanceRow[]) {
  for (const deal of sortedDeals) {
    const delta = dealNet(deal);
    if (classifyBalanceOperation(deal.type, deal.comment, delta) === "deposit" && delta > 0) {
      return delta;
    }
  }

  const firstTradeMetricDeal = sortedDeals.find((deal) => isTradeMetricDeal(deal.type, deal.comment));
  if (firstTradeMetricDeal) {
    return Math.max(0, deriveStartingBalanceFromDeal(firstTradeMetricDeal));
  }

  const firstKnownBalance = sortedDeals.find((deal) => getDealBalanceValue(deal) !== null);
  return Math.max(0, firstKnownBalance ? Number(getDealBalanceValue(firstKnownBalance) ?? 0) : 0);
}

function resolveGrowthBalanceAfter(
  deal: BalanceRow,
  previousBalance: number | null,
) {
  const balanceAfter = getDealBalanceValue(deal);
  if (balanceAfter !== null) {
    return balanceAfter;
  }

  if (previousBalance === null || !Number.isFinite(previousBalance)) {
    return null;
  }

  const nextBalance = previousBalance + dealNet(deal);
  return Number.isFinite(nextBalance) ? nextBalance : null;
}

function resolveGrowthOpeningBalance(sortedDeals: BalanceRow[]) {
  if (!sortedDeals.length) {
    return 0;
  }

  let runningBalance = deriveStartingBalanceFromDeal(sortedDeals[0]!);
  if (!Number.isFinite(runningBalance)) {
    runningBalance = 0;
  }

  for (const deal of sortedDeals) {
    const balanceAfter = resolveGrowthBalanceAfter(deal, runningBalance);
    if (balanceAfter !== null) {
      runningBalance = balanceAfter;
    }

    if (isBalanceDeal(deal.type, deal.comment, dealNet(deal)) && Number.isFinite(runningBalance) && runningBalance !== 0) {
      return runningBalance;
    }
  }

  const startingBalance = deriveStartingBalanceFromDeal(sortedDeals[0]!);
  if (Number.isFinite(startingBalance) && startingBalance > 0) {
    return startingBalance;
  }

  const firstKnownBalance = resolveGrowthBalanceAfter(sortedDeals[0]!, null);
  return Number.isFinite(firstKnownBalance) ? Number(firstKnownBalance) : 0;
}

function buildTradeMetricBalanceTimeline(deals: BalanceRow[]) {
  const sortedDeals = sortDeals(deals);
  const sortedTradeMetricDeals = sortedDeals.filter((deal) => isTradeMetricDeal(deal.type, deal.comment));
  const initialDeposit = resolveInitialDeposit(sortedDeals);
  let runningBalance = initialDeposit;

  const points = sortedTradeMetricDeals.reduce<TradingBalancePoint[]>((timeline, deal) => {
    const delta = dealNet(deal);
    if (!Number.isFinite(delta)) {
      return timeline;
    }

    runningBalance += delta;
    timeline.push({
      time: deal.time,
      balance: runningBalance,
      delta,
      type: deal.type ?? null,
      comment: deal.comment ?? null,
    });
    return timeline;
  }, []);

  return {
    initialDeposit,
    points,
  };
}

function collectTradeMetricWindow(deals: BalanceRow[], start: Date | null, end: Date | null = null) {
  const sortedDeals = sortDeals(deals);
  const { initialDeposit, points } = buildTradeMetricBalanceTimeline(sortedDeals);
  if (!points.length) {
    const totalDeposits = sortedDeals.reduce((total, deal) => {
      const timestamp = new Date(deal.time).getTime();
      if (!Number.isFinite(timestamp)) {
        return total;
      }

      if (end && timestamp > end.getTime()) {
        return total;
      }

      const delta = dealNet(deal);
      const operation = classifyBalanceOperation(deal.type, deal.comment, delta);
      return operation === "deposit" && delta > 0 ? total + delta : total;
    }, 0);

    return {
      points: [] as TradingBalancePoint[],
      initialDeposit,
      totalDeposits: totalDeposits > 0 ? totalDeposits : initialDeposit,
      startBalance: initialDeposit,
      endBalance: initialDeposit,
    };
  }

  const startTimestamp = start ? start.getTime() : null;
  const endTimestamp = end ? end.getTime() : null;
  let startBalance = initialDeposit;
  const window: TradingBalancePoint[] = [];
  let totalDeposits = 0;

  for (const deal of sortedDeals) {
    const timestamp = new Date(deal.time).getTime();
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    if (endTimestamp !== null && timestamp > endTimestamp) {
      break;
    }

    const delta = dealNet(deal);
    const operation = classifyBalanceOperation(deal.type, deal.comment, delta);
    if (operation === "deposit" && delta > 0) {
      totalDeposits += delta;
    }
  }

  for (const point of points) {
    const timestamp = new Date(point.time).getTime();
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    if (startTimestamp !== null && timestamp < startTimestamp) {
      startBalance = point.balance;
      continue;
    }

    if (endTimestamp !== null && timestamp > endTimestamp) {
      break;
    }

    window.push(point);
  }

  const endBalance = window.length ? window[window.length - 1]?.balance ?? startBalance : startBalance;

  return {
    points: window,
    initialDeposit,
    totalDeposits: totalDeposits > 0 ? totalDeposits : initialDeposit,
    startBalance,
    endBalance,
  };
}

function collectGrowthWindow(deals: BalanceRow[], start: Date | null, end: Date | null = null) {
  const sorted = sortDeals(deals);
  if (!sorted.length) {
    return { window: [] as BalanceRow[], startBalance: 0, endBalance: 0 };
  }

  const startTimestamp = start ? start.getTime() : null;
  const endTimestamp = end ? end.getTime() : null;
  let runningBalance = startTimestamp === null ? resolveGrowthOpeningBalance(sorted) : deriveStartingBalanceFromDeal(sorted[0]!);
  if (!Number.isFinite(runningBalance)) {
    runningBalance = 0;
  }

  let startBalance = runningBalance;
  const window: BalanceRow[] = [];

  for (const deal of sorted) {
    const timestamp = new Date(deal.time).getTime();
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const balanceAfter = resolveGrowthBalanceAfter(deal, runningBalance);

    if (startTimestamp !== null && timestamp < startTimestamp) {
      if (balanceAfter !== null) {
        runningBalance = balanceAfter;
        startBalance = runningBalance;
      }
      continue;
    }

    if (endTimestamp !== null && timestamp > endTimestamp) {
      break;
    }

    if (window.length === 0) {
      startBalance = runningBalance;
    }

    window.push(deal);
    if (balanceAfter !== null) {
      runningBalance = balanceAfter;
    }
  }

  return {
    window,
    startBalance,
    endBalance: Number.isFinite(runningBalance) ? runningBalance : startBalance,
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

function getPositionCloseTime(row: { closeTime?: Date | string | null; outTime?: Date | string | null }) {
  return row.outTime ?? row.closeTime ?? null;
}

function getPositionOpenTime(row: { openTime?: Date | string | null; inTime?: Date | string | null }) {
  return row.inTime ?? row.openTime ?? null;
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
    case "1w":
    case "w":
    case "5d":
    case "week":
      return "1w";
    case "1m":
    case "m":
    case "month":
      return "1m";
    case "ytd":
    case "year-to-date":
    case "year_to_date":
    case "3m":
    case "6m":
      return "ytd";
    case "1y":
    case "year":
      return "1y";
    case "a":
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
    case "1w": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 6);
      return start;
    }
    case "1m":
      return startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    case "ytd":
      return startOfDay(new Date(now.getFullYear(), 0, 1));
    case "1y":
      return startOfDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
    default:
      return null;
  }
}

export function getTimeframeLabel(timeframe: Timeframe) {
  switch (timeframe) {
    case "1d":
      return "D";
    case "1w":
      return "W";
    case "1m":
      return "M";
    case "ytd":
      return "YTD";
    case "1y":
      return "1Y";
    default:
      return "A";
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

export function positionNetPnl(row: { profit?: NumericLike; commission?: NumericLike; swap?: NumericLike }) {
  return dealNet(row);
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

export function isBalanceDeal(type: string | null | undefined, comment?: string | null, delta?: number | null) {
  return classifyBalanceOperation(type, comment, delta ?? null) !== null;
}

export function isFundingDeal(type: string | null | undefined, comment?: string | null, delta?: number | null) {
  return isBalanceDeal(type, comment, delta ?? null);
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
  const { window, startBalance, endBalance } = collectGrowthWindow(deals, start, end);
  if (!window.length || !Number.isFinite(startBalance)) {
    return 0;
  }

  let growthFactor = 1;
  let currentSegmentOpeningBalance = startBalance;
  let previousBalance = startBalance;
  let hasBalanceOperation = false;
  let invalidSegmentCount = 0;

  for (const deal of window) {
    const delta = dealNet(deal);
    const balanceAfter = resolveGrowthBalanceAfter(deal, previousBalance);
    const operation = classifyBalanceOperation(deal.type, deal.comment, delta);

    if (operation !== null) {
      hasBalanceOperation = true;

      if (Number.isFinite(currentSegmentOpeningBalance) && currentSegmentOpeningBalance > 0) {
        growthFactor *= previousBalance / currentSegmentOpeningBalance;
      } else if (Number.isFinite(previousBalance) && previousBalance !== currentSegmentOpeningBalance) {
        invalidSegmentCount += 1;
      }

      if (balanceAfter !== null) {
        currentSegmentOpeningBalance = balanceAfter;
        previousBalance = balanceAfter;
      }

      continue;
    }

    if (balanceAfter !== null) {
      previousBalance = balanceAfter;
    }
  }

  if (hasBalanceOperation) {
    if (Number.isFinite(currentSegmentOpeningBalance) && currentSegmentOpeningBalance > 0) {
      growthFactor *= endBalance / currentSegmentOpeningBalance;
    } else if (Number.isFinite(endBalance) && endBalance !== currentSegmentOpeningBalance) {
      invalidSegmentCount += 1;
    }
  } else if (startBalance > 0) {
    growthFactor = endBalance / startBalance;
  } else {
    invalidSegmentCount += 1;
  }

  if (invalidSegmentCount > 0) {
    console.warn("Skipped invalid growth segment(s) with zero opening balance.", {
      end: end?.toISOString() ?? null,
      invalidSegmentCount,
      start: start?.toISOString() ?? null,
    });
  }

  const growth = (growthFactor - 1) * 100;
  return Number.isFinite(growth) ? growth : 0;
}

export function computeAbsoluteGain(
  deals: BalanceRow[],
  start: Date | null,
  end: Date | null = null,
) {
  const { points, initialDeposit, startBalance, endBalance } = collectTradeMetricWindow(deals, start, end);
  if (!points.length) {
    return 0;
  }

  const profit = endBalance - startBalance;
  const capitalBase = startBalance > 0 ? startBalance : initialDeposit > 0 ? initialDeposit : 0;
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
  rows: Array<{
    openTime?: Date | string | null;
    inTime?: Date | string | null;
    closeTime?: Date | string | null;
    outTime?: Date | string | null;
  }>,
) {
  const spans = rows
    .map((row) => {
      const openTime = getPositionOpenTime(row);
      const closeTime = getPositionCloseTime(row);
      if (!openTime || !closeTime) {
        return null;
      }

      const opened = new Date(openTime).getTime();
      const closed = new Date(closeTime).getTime();
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

export function isClosedPosition(row: { closeTime?: Date | string | null; outTime?: Date | string | null }) {
  const closeTime = getPositionCloseTime(row);
  if (!closeTime) {
    return false;
  }

  return Number.isFinite(new Date(closeTime).getTime());
}

export function positionProfit(row: { profit?: NumericLike; commission?: NumericLike; swap?: NumericLike }) {
  return positionNetPnl(row);
}

export function summarizeClosedPositions(rows: PositionMetricRow[]) {
  const closedPositions = rows
    .filter((row) => isClosedPosition(row))
    .map((row) => ({
      ...row,
      closeTimestamp: new Date(getPositionCloseTime(row) as Date | string).getTime(),
      profitValue: positionProfit(row),
      side: normalizeTradeSide(row.type, row.direction ?? row.type),
      sortKey: getPositionSortKey(row),
    }))
    .filter((row) => Number.isFinite(row.closeTimestamp) && Number.isFinite(row.profitValue))
    .sort((left, right) => left.closeTimestamp - right.closeTimestamp || left.sortKey.localeCompare(right.sortKey));

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
    netValues: profits,
    totalTrades,
    totalNetProfit,
    winPercent: totalTrades > 0 ? (profitTradesCount / totalTrades) * 100 : null,
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
  deals: Array<{
    time: Date | string;
    type?: string | null;
    comment?: string | null;
    profit?: NumericLike;
    commission?: NumericLike;
    swap?: NumericLike;
  }>,
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
    if (!isTradeMetricDeal(deal.type, deal.comment)) {
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
  deals: Array<{
    type?: string | null;
    comment?: string | null;
    profit?: NumericLike;
    commission?: NumericLike;
    swap?: NumericLike;
  }>,
) {
  return deals.reduce(
    (totals, deal) => {
      const delta = dealNet(deal);
      if (!Number.isFinite(delta) || delta === 0) {
        return totals;
      }

      const operation = classifyBalanceOperation(deal.type, deal.comment, delta);
      if (operation === "deposit" && delta > 0) {
        totals.totalDeposit += delta;
      } else if (operation === "withdrawal" && delta < 0) {
        totals.totalWithdraw += Math.abs(delta);
      }

      return totals;
    },
    { totalDeposit: 0, totalWithdraw: 0 },
  );
}

export function computeDepositLoadPercent(params: {
  totalDeposit: number | null | undefined;
  margin: number | null | undefined;
  floatingProfit: number | null | undefined;
}) {
  const totalDeposit = Number(params.totalDeposit ?? 0);
  if (!Number.isFinite(totalDeposit) || totalDeposit <= 0) {
    return null;
  }

  const margin = Math.max(0, Number(params.margin ?? 0));
  const floatingProfit = Number(params.floatingProfit ?? 0);
  const floatingLossOnly = Number.isFinite(floatingProfit) && floatingProfit < 0 ? Math.abs(floatingProfit) : 0;
  const load = ((margin + floatingLossOnly) / totalDeposit) * 100;

  return Number.isFinite(load) ? load : null;
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
  start: Date | null = null,
  end: Date | null = null,
) {
  const { points, startBalance } = collectTradeMetricWindow(deals, start, end);
  if (!points.length) {
    return [];
  }

  const output: Array<{
    time: Date;
    equity: number;
    unitValue: number;
    highWaterMark: number;
    drawdownPercent: number;
  }> = [];

  let highWaterMark = startBalance;

  points.forEach((point) => {
    highWaterMark = Math.max(highWaterMark, point.balance);
    const drawdownPercent = highWaterMark > 0 ? ((highWaterMark - point.balance) / highWaterMark) * 100 : 0;

    output.push({
      time: new Date(point.time),
      equity: point.balance,
      unitValue: point.balance,
      highWaterMark,
      drawdownPercent,
    });
  });

  return output;
}

export function computeBalanceDrawdown(
  deals: BalanceRow[],
  start: Date | null = null,
  end: Date | null = null,
) {
  const { points, initialDeposit, totalDeposits, startBalance } = collectTradeMetricWindow(deals, start, end);
  const absoluteAmount = Math.max(0, totalDeposits - startBalance);

  if (!points.length) {
    return {
      initialDeposit,
      totalDeposits,
      minimalBalance: startBalance,
      absoluteAmount,
      maximalAmount: 0,
      maximalPercent: 0,
      relativeAmount: 0,
      relativePercent: 0,
      peakBalance: startBalance,
      troughBalance: startBalance,
    };
  }

  let runningPeak = startBalance;
  let peakBalance = startBalance;
  let troughBalance = startBalance;
  let minimalBalance = startBalance;
  let maximalAmount = 0;
  let maximalPercent = 0;
  let relativeAmount = 0;
  let relativePercent = 0;

  for (const point of points) {
    minimalBalance = Math.min(minimalBalance, point.balance);
    runningPeak = Math.max(runningPeak, point.balance);

    const currentAmount = runningPeak - point.balance;
    const currentPercent = runningPeak > 0 ? (currentAmount / runningPeak) * 100 : 0;
    if (currentAmount > maximalAmount || (currentAmount === maximalAmount && currentPercent > maximalPercent)) {
      maximalAmount = currentAmount;
      maximalPercent = currentPercent;
      peakBalance = runningPeak;
      troughBalance = point.balance;
    }

    if (currentPercent > relativePercent || (currentPercent === relativePercent && currentAmount > relativeAmount)) {
      relativeAmount = currentAmount;
      relativePercent = currentPercent;
    }
  }

  return {
    initialDeposit,
    totalDeposits,
    minimalBalance,
    absoluteAmount: Math.max(0, totalDeposits - minimalBalance),
    maximalAmount,
    maximalPercent,
    relativeAmount,
    relativePercent,
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
