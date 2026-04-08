import { prisma } from "@/lib/prisma";
import type {
  AccountOverviewResponse,
  BalanceDetailResponse,
  GrowthResponse,
  PositionsResponse,
  ProfitDetailResponse,
  TradeExecutionDistribution,
  Timeframe,
  WinDetailResponse,
} from "@/lib/trading/types";
import {
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
  computeSharpeRatio,
  computeYearGrowth,
  dealNet,
  filterBySince,
  getAccountAnchorDate,
  getAccountBundle,
  getLongTradeWinPercent,
  getShortTradeWinPercent,
  getSinceDate,
  getTimeframeLabel,
  isClosedPosition,
  isBalanceDeal,
  isFundingDeal,
  isTradingDeal,
  normalizeTradeSide,
  parseTimeframe,
  positionNetPnl,
  serializeAccountBundle,
  serializeOpenPositions,
  summarizeClosedPositions,
  summarizeTrades,
} from "@/lib/trading/account-data";

const ACCOUNT_CACHE_REVALIDATE_MS = 5_000;
const TIMEFRAMES: Timeframe[] = ["1d", "1w", "1m", "ytd", "1y", "all"];
const MONTH_LABELS = Array.from({ length: 12 }, (_, index) =>
  new Date(2024, index, 1).toLocaleString("en-US", { month: "short" }),
);

type DealRow = {
  time: Date | string;
  type?: string | null;
  direction?: string | null;
  comment?: string | null;
  symbol?: string | null;
  volume?: number | null;
  price?: number | null;
  profit?: number | null;
  commission?: number | null;
  swap?: number | null;
  dealId?: string;
  dealNo?: string;
  balanceAfter?: number | null;
  balance?: number | null;
};

type PositionRow = {
  closeTime: Date | string | null;
  openTime?: Date | string | null;
  reportDate?: Date | string | null;
  positionNo?: string;
  symbol?: string;
  type?: string;
  volume?: number;
  openPrice?: number | null;
  closePrice?: number | null;
  sl?: number | null;
  tp?: number | null;
  profit?: number | null;
  swap?: number | null;
  commission?: number | null;
  comment?: string | null;
};

type OpenPositionRow = {
  reportDate?: Date | string | null;
  profit?: number | null;
  floatingProfit?: number | null;
  floating_profit?: number | null;
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_REPORT_FUTURE_SKEW_MS = 5 * 60 * 1000;

function startOfReportDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function padTwo(value: number) {
  return String(value).padStart(2, "0");
}

function getValidDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getReportLocalDateKey(value: Date | string | null | undefined) {
  const parsed = getValidDate(value);
  if (!parsed) {
    return null;
  }

  return `${parsed.getUTCFullYear()}-${padTwo(parsed.getUTCMonth() + 1)}-${padTwo(parsed.getUTCDate())}`;
}

function buildTradeExecutionDistribution(deals: DealRow[], reportTime: Date): TradeExecutionDistribution {
  const reportDate = getReportLocalDateKey(reportTime) ?? reportTime.toISOString().slice(0, 10);
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    totalExecutions: 0,
    buyExecutions: 0,
    sellExecutions: 0,
    totalVolume: 0,
    totalProfit: 0,
  }));
  const seenDealKeys = new Set<string>();
  let totalExecutions = 0;
  let buyExecutions = 0;
  let sellExecutions = 0;
  let excludedOutsideReportDate = 0;
  let excludedFutureSkew = 0;

  for (const deal of deals) {
    if (!isTradingDeal(deal.type)) {
      continue;
    }

    const parsedTime = getValidDate(deal.time);
    if (!parsedTime) {
      continue;
    }

    const executionDate = getReportLocalDateKey(parsedTime);
    if (executionDate !== reportDate) {
      excludedOutsideReportDate += 1;
      continue;
    }

    if (parsedTime.getTime() > reportTime.getTime() + MAX_REPORT_FUTURE_SKEW_MS) {
      excludedFutureSkew += 1;
      continue;
    }

    const side = normalizeTradeSide(deal.type, deal.direction);
    const dedupeKey = String(
      deal.dealNo
      ?? deal.dealId
      ?? `${parsedTime.toISOString()}|${side}|${deal.symbol ?? ""}|${Number(deal.price ?? 0)}|${Number(deal.volume ?? 0)}`,
    );
    if (seenDealKeys.has(dedupeKey)) {
      continue;
    }
    seenDealKeys.add(dedupeKey);

    const hour = parsedTime.getUTCHours();
    const bucket = hourly[hour];
    if (!bucket) {
      continue;
    }

    const volume = Number(deal.volume ?? 0);
    const profit = dealNet(deal);
    bucket.totalExecutions += 1;
    bucket.totalVolume += Number.isFinite(volume) ? volume : 0;
    bucket.totalProfit += Number.isFinite(profit) ? profit : 0;
    totalExecutions += 1;

    if (side === "buy") {
      bucket.buyExecutions += 1;
      buyExecutions += 1;
    } else if (side === "sell") {
      bucket.sellExecutions += 1;
      sellExecutions += 1;
    }
  }

  return {
    reportDate,
    reportTimestamp: reportTime.toISOString(),
    timezoneBasis: "report-local",
    totalExecutions,
    buyExecutions,
    sellExecutions,
    excludedOutsideReportDate,
    excludedFutureSkew,
    hourly,
  };
}

function getDealBalancePointValue(deal: DealRow) {
  const value = Number(deal.balanceAfter ?? deal.balance ?? Number.NaN);
  return Number.isFinite(value) ? value : null;
}

function deriveOpeningBalance(deal: DealRow) {
  const balanceAfter = getDealBalancePointValue(deal);
  if (balanceAfter === null) {
    return 0;
  }

  return balanceAfter - dealNet(deal);
}

function buildRealtime24HourBalanceCurve(
  deals: DealRow[],
  reportTime: Date,
  endingBalance: number,
) {
  const sortedDeals = [...deals].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  const anchorTime = reportTime.getTime();
  const startTime = startOfReportDay(reportTime).getTime();
  const endTime = startTime + 24 * ONE_HOUR_MS;
  const clampedAnchorTime = Math.min(Math.max(anchorTime, startTime), endTime);
  const fallbackOpeningBalance =
    Number.isFinite(endingBalance) && endingBalance > 0
      ? endingBalance
      : sortedDeals.length
        ? deriveOpeningBalance(sortedDeals[0]!)
        : 0;

  let previousCloseBalance = fallbackOpeningBalance;

  for (const deal of sortedDeals) {
    const timestamp = new Date(deal.time).getTime();
    if (!Number.isFinite(timestamp) || timestamp >= startTime) {
      break;
    }

    const balanceAfter = getDealBalancePointValue(deal);
    if (balanceAfter !== null) {
      previousCloseBalance = balanceAfter;
    }
  }

  const points: Array<{
    time: Date;
    balance: number;
    eventType: string | null;
    eventDelta: number | null;
  }> = [
    {
      time: new Date(startTime),
      balance: previousCloseBalance,
      eventType: null,
      eventDelta: null,
    },
  ];

  let runningBalance = previousCloseBalance;

  for (const deal of sortedDeals) {
    const timestamp = new Date(deal.time).getTime();
    if (!Number.isFinite(timestamp) || timestamp < startTime) {
      continue;
    }

    if (timestamp > clampedAnchorTime) {
      break;
    }

    const balanceAfter = getDealBalancePointValue(deal);
    if (balanceAfter === null) {
      continue;
    }

    runningBalance = balanceAfter;
    points.push({
      time: new Date(timestamp),
      balance: runningBalance,
      eventType: deal.type ?? null,
      eventDelta: dealNet(deal),
    });
  }

  const latestPoint = points[points.length - 1];
  const shouldAppendCurrentPoint =
    !latestPoint
    || latestPoint.time.getTime() !== clampedAnchorTime
    || Math.abs(latestPoint.balance - endingBalance) > 0.000001;

  if (shouldAppendCurrentPoint) {
    points.push({
      time: new Date(clampedAnchorTime),
      balance: Number.isFinite(endingBalance) ? endingBalance : runningBalance,
      eventType: null,
      eventDelta: null,
    });
  }

  return points;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isMonthCovered(
  monthStart: Date,
  monthEnd: Date,
  firstDealTime: Date | null,
  latestCoveredTime: Date | null,
) {
  if (!firstDealTime || !latestCoveredTime) {
    return false;
  }

  return monthEnd >= new Date(firstDealTime.getFullYear(), firstDealTime.getMonth(), 1, 0, 0, 0, 0)
    && monthStart <= latestCoveredTime;
}

function sumTradingNetForRange(deals: DealRow[], start: Date, end: Date) {
  return deals.reduce((total, deal) => {
    const timestamp = new Date(deal.time).getTime();
    if (!Number.isFinite(timestamp) || timestamp < start.getTime() || timestamp > end.getTime()) {
      return total;
    }

    return !isFundingDeal(deal.type, deal.comment, dealNet(deal)) ? total + dealNet(deal) : total;
  }, 0);
}

function buildCalendarMonthlyPerformance(deals: DealRow[], reportTime: Date) {
  const sortedDeals = [...deals].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  if (!sortedDeals.length) {
    return {
      years: [] as Array<{
        year: number;
        months: Array<{
          month: number;
          label: string;
          growthPercent: number | null;
          netAmount: number | null;
        }>;
        totalGrowthPercent: number | null;
        totalNetAmount: number | null;
      }>,
      summary: {
        totalGrowthPercent: 0,
        totalNetAmount: 0,
      },
    };
  }

  const firstDealTime = new Date(sortedDeals[0].time);
  const latestCoveredTime = new Date(reportTime);
  const firstYear = firstDealTime.getFullYear();
  const lastYear = latestCoveredTime.getFullYear();
  let totalRatio = 1;
  let totalNetAmount = 0;

  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, yearIndex) => {
    const year = firstYear + yearIndex;
    let yearRatio = 1;
    let yearNetAmount = 0;
    let hasCoveredMonth = false;

    const months = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
      const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
      if (!isMonthCovered(monthStart, monthEnd, firstDealTime, latestCoveredTime)) {
        return {
          month: monthIndex,
          label: MONTH_LABELS[monthIndex] ?? "",
          growthPercent: null,
          netAmount: null,
        };
      }

      hasCoveredMonth = true;
      const growthPercent = computeCompoundedGrowth(deals, monthStart, monthEnd);
      const monthRatio = 1 + growthPercent / 100;
      const netAmount = sumTradingNetForRange(deals, monthStart, monthEnd);

      yearRatio *= Number.isFinite(monthRatio) ? monthRatio : 1;
      yearNetAmount += netAmount;
      totalRatio *= Number.isFinite(monthRatio) ? monthRatio : 1;
      totalNetAmount += netAmount;

      return {
        month: monthIndex,
        label: MONTH_LABELS[monthIndex] ?? "",
        growthPercent,
        netAmount,
      };
    });

    return hasCoveredMonth
      ? {
          year,
          months,
          totalGrowthPercent: (yearRatio - 1) * 100,
          totalNetAmount: yearNetAmount,
        }
      : null;
  })
    .filter((year): year is NonNullable<typeof year> => year !== null)
    .sort((left, right) => right.year - left.year);

  return {
    years,
    summary: {
      totalGrowthPercent: (totalRatio - 1) * 100,
      totalNetAmount,
    },
  };
}

function computeTradesPerWeek(
  timeframe: Timeframe,
  rows: Array<{ closeTime: Date | string | null }>,
) {
  if (timeframe === "all") {
    return null;
  }

  const closed = rows.filter((row) => row.closeTime);
  if (!closed.length) {
    return null;
  }

  const sorted = [...closed].sort((left, right) => new Date(left.closeTime ?? 0).getTime() - new Date(right.closeTime ?? 0).getTime());
  const oldest = new Date(sorted[0].closeTime ?? 0).getTime();
  const newest = new Date(sorted[sorted.length - 1].closeTime ?? 0).getTime();

  if (!Number.isFinite(oldest) || !Number.isFinite(newest)) {
    return null;
  }

  const weeks = Math.max(1, (newest - oldest) / 604_800_000);
  return closed.length / weeks;
}

function computeAverageStreaks(values: number[]) {
  const winStreaks: number[] = [];
  const lossStreaks: number[] = [];

  let currentType: "win" | "loss" | null = null;
  let currentLength = 0;

  const pushCurrent = () => {
    if (!currentType || currentLength === 0) {
      return;
    }

    if (currentType === "win") {
      winStreaks.push(currentLength);
    } else {
      lossStreaks.push(currentLength);
    }
  };

  for (const value of values) {
    const nextType = value > 0 ? "win" : value < 0 ? "loss" : null;
    if (!nextType) {
      pushCurrent();
      currentType = null;
      currentLength = 0;
      continue;
    }

    if (nextType === currentType) {
      currentLength += 1;
      continue;
    }

    pushCurrent();
    currentType = nextType;
    currentLength = 1;
  }

  pushCurrent();

  const average = (streaks: number[]) =>
    streaks.length ? streaks.reduce((total, value) => total + value, 0) / streaks.length : null;

  return {
    averageWins: average(winStreaks),
    averageLosses: average(lossStreaks),
  };
}

type CachedTimeframeViews = {
  overview: AccountOverviewResponse;
  balanceDetail: BalanceDetailResponse;
  growth: GrowthResponse;
  positions: PositionsResponse;
  profitDetail: ProfitDetailResponse;
  winDetail: WinDetailResponse;
};

type AccountPreaggregatedBundle = {
  accountId: string;
  versionKey: string;
  lastCheckedAt: number;
  timeframes: Record<Timeframe, CachedTimeframeViews>;
};

const accountCache = new Map<string, AccountPreaggregatedBundle>();

type AccountVersionProbe = {
  accountId: string;
  versionKey: string;
};

async function getAccountVersionProbe(accountId: string): Promise<AccountVersionProbe | null> {
  const account = await (prisma as any).tradingAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      updatedAt: true,
      reportDate: true,
      accountSnapshot: {
        select: {
          updatedAt: true,
          reportDate: true,
        },
      },
      accountReportResult: {
        select: {
          computedAt: true,
          sourceReportDate: true,
        },
      },
      reportImports: {
        select: {
          createdAt: true,
          reportDate: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!account) {
    return null;
  }

  const latestImport = account.reportImports[0];
  const versionKey = [
    account.id,
    account.updatedAt?.toISOString() ?? "0",
    account.reportDate?.toISOString() ?? "0",
    account.accountSnapshot?.updatedAt?.toISOString() ?? "0",
    account.accountSnapshot?.reportDate?.toISOString() ?? "0",
    account.accountReportResult?.computedAt?.toISOString() ?? "0",
    account.accountReportResult?.sourceReportDate?.toISOString() ?? "0",
    latestImport?.createdAt?.toISOString() ?? "0",
    latestImport?.reportDate?.toISOString() ?? "0",
  ].join("|");

  return {
    accountId: account.id,
    versionKey,
  };
}

function buildTimeframeView(params: {
  timeframe: Timeframe;
  account: NonNullable<ReturnType<typeof serializeAccountBundle>>;
  deals: DealRow[];
  positions: PositionRow[];
  openPositions: OpenPositionRow[];
  latestSnapshotBalance: number;
  latestSnapshotEquity: number;
  latestSnapshotMargin: number;
  reportTime: Date;
}) {
  const {
    timeframe,
    account,
    deals,
    positions,
    openPositions,
    latestSnapshotBalance,
    latestSnapshotEquity,
    latestSnapshotMargin,
    reportTime,
  } = params;

  const since = getSinceDate(timeframe, reportTime);
  const scopedDeals = filterBySince(deals, (deal) => deal.time, since);
  const drawdownDeals = deals.filter((deal) => !isBalanceDeal(deal.type, deal.comment, dealNet(deal)));
  const tradingDeals = scopedDeals.filter((deal) => isTradingDeal(deal.type));
  const sortedScopedDeals = [...scopedDeals].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  const scopedPositions = filterBySince(positions, (position) => position.closeTime, since);
  const scopedClosedPositions = scopedPositions.filter((position) => isClosedPosition(position));
  const closedPositionSummary = summarizeClosedPositions(scopedClosedPositions);

  const endingBalance = Number.isFinite(latestSnapshotBalance) && latestSnapshotBalance > 0
    ? latestSnapshotBalance
    : account.balance;
  const balanceCurve = timeframe === "1d"
    ? buildRealtime24HourBalanceCurve(deals, reportTime, endingBalance)
    : buildBalanceCurve(sortedScopedDeals, openPositions);
  const periodGrowth = timeframe === "all" ? computeAllTimeGrowth(deals) : computeCompoundedGrowth(deals, since, null);
  const drawdown = computeBalanceDrawdown(drawdownDeals, since, null);
  const outcomeSummary = summarizeTrades(tradingDeals);
  const grossLoss = Math.abs(tradingDeals.filter((trade) => dealNet(trade) < 0).reduce((total, trade) => total + dealNet(trade), 0));
  const fundingTotals = buildFundingTotals(scopedDeals);
  const monthlyPerformance = buildCalendarMonthlyPerformance(deals, reportTime);
  const tradeExecutions = buildTradeExecutionDistribution(deals, reportTime);
  const openPositionsPayload = serializeOpenPositions(openPositions as any);
  const openBySymbol = Object.values(
    openPositionsPayload.reduce<Record<string, { symbol: string; count: number; volume: number; floatingProfit: number }>>(
      (groups, position) => {
        const symbol = position.symbol || "UNKNOWN";
        const current = groups[symbol] ?? {
          symbol,
          count: 0,
          volume: 0,
          floatingProfit: 0,
        };

        current.count += 1;
        current.volume += Number(position.volume ?? 0);
        current.floatingProfit += Number(position.floatingProfit ?? 0);
        groups[symbol] = current;
        return groups;
      },
      {},
    ),
  ).sort((left, right) => Math.abs(right.floatingProfit) - Math.abs(left.floatingProfit));

  const overview: AccountOverviewResponse = {
    timeframe,
    account,
    kpis: {
      periodGrowth,
      netProfit: outcomeSummary.netProfit,
      grossLoss,
      totalSwap: tradingDeals.reduce((total, trade) => total + Number(trade.swap ?? 0), 0),
      totalCommission: tradingDeals.reduce((total, trade) => total + Number(trade.commission ?? 0), 0),
      totalDeposit: fundingTotals.totalDeposit,
      totalWithdrawal: fundingTotals.totalWithdraw,
      drawdown: drawdown.relativePercent,
      absoluteDrawdown: drawdown.absoluteAmount,
      winPercent: closedPositionSummary.winPercent,
      trades: closedPositionSummary.totalTrades,
      floatingPL: openPositions.reduce((total, position) => total + Number(position.profit ?? 0), 0),
      openCount: openPositions.length,
    },
    openPositions: openPositionsPayload,
    openBySymbol,
    monthlyPerformance,
    balanceCurve: balanceCurve.map((point) => ({
      x: toIso(point.time),
      y: point.balance,
      balance: point.balance,
      eventType: point.eventType ?? null,
      eventDelta: point.eventDelta ?? null,
    })),
    tradeExecutions,
  };

  const unitDrawdownCurve = buildUnitDrawdownCurve(drawdownDeals, since, null);
  const currentFloatingProfit = openPositionsPayload.reduce((total, position) => total + Number(position.floatingProfit ?? 0), 0);
  const currentDepositLoad = computeDepositLoadPercent({
    totalDeposit: fundingTotals.totalDeposit,
    margin: latestSnapshotMargin,
    floatingProfit: currentFloatingProfit,
  });
  const runAmounts = computeConsecutiveRunAmounts(
    sortedScopedDeals
      .filter((deal) => isTradingDeal(deal.type))
      .map((deal) => dealNet(deal)),
  );

  const balanceDetail: BalanceDetailResponse = {
    timeframe,
    account,
    summary: {
      absoluteDrawdown: drawdown.absoluteAmount,
      relativeDrawdownPct: drawdown.relativePercent,
      maximalDrawdownAmount: drawdown.maximalAmount,
      maximalDrawdownPct: drawdown.maximalPercent,
      averageLossTrade: closedPositionSummary.averageLossTrade,
      maximalDepositLoad: currentDepositLoad,
      maximumConsecutiveLossAmount: runAmounts.maxConsecutiveLossAmount,
    },
    mfeMae: {
      available: false,
      reason: "Unavailable from current report data",
      mfe: null,
      mae: null,
    },
    balanceCurve: balanceCurve.map((point) => ({
      x: toIso(point.time),
      y: point.balance,
      balance: point.balance,
      eventType: point.eventType ?? null,
      eventDelta: point.eventDelta ?? null,
    })),
    drawdownCurve: unitDrawdownCurve.map((point) => ({
      x: point.time.toISOString(),
      y: point.drawdownPercent,
    })),
  };

  const year = reportTime.getFullYear();
  const allTimeGrowth = computeAllTimeGrowth(deals);
  const ytdGrowth = computeYearGrowth(deals, year);
  const allTimeAbsoluteGain = computeAbsoluteGain(deals, null);
  const ytdAbsoluteGain = computeAbsoluteGain(
    deals,
    new Date(year, 0, 1, 0, 0, 0, 0),
    new Date(year, 11, 31, 23, 59, 59, 999),
  );
  void ytdAbsoluteGain;
  const absoluteGain = timeframe === "all" ? allTimeAbsoluteGain : computeAbsoluteGain(deals, since, null);

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const start = new Date(year, index, 1, 0, 0, 0, 0);
    const end = new Date(year, index + 1, 0, 23, 59, 59, 999);

    return {
      month: start.toLocaleString("en-US", { month: "short" }),
      value: computeCompoundedGrowth(deals, start, end),
    };
  });

  const years = deals.map((deal) => new Date(deal.time).getFullYear());
  const firstYear = years.length ? Math.min(...years) : year;
  const yearly = Array.from({ length: year - firstYear + 1 }, (_, index) => {
    const itemYear = firstYear + index;
    return {
      year: itemYear,
      value: computeYearGrowth(deals, itemYear),
    };
  });

  const growth: GrowthResponse = {
    timeframe,
    account,
    summary: {
      periodGrowth,
      ytdGrowth,
      allTimeGrowth,
      absoluteGain,
      periodLabel: getTimeframeLabel(timeframe),
    },
    series: {
      monthly,
      yearly,
    },
    balanceOperations: deals
      .filter((deal) => isBalanceDeal(deal.type, deal.comment, dealNet(deal)))
      .map((deal) => ({
        time: toIso(deal.time),
        type: deal.type ?? null,
        delta: dealNet(deal),
      })),
  };

  const orderedScopedPositions = [...scopedClosedPositions].sort(
    (left, right) => new Date(left.closeTime ?? 0).getTime() - new Date(right.closeTime ?? 0).getTime(),
  );
  const historyPositions = [...orderedScopedPositions]
    .sort((left, right) => new Date(right.closeTime ?? right.reportDate ?? 0).getTime() - new Date(left.closeTime ?? left.reportDate ?? 0).getTime())
    .map((position) => ({
      positionId: position.positionNo ?? "",
      symbol: position.symbol ?? "UNKNOWN",
      type: position.type ?? "",
      volume: position.volume ?? 0,
      openedAt: position.openTime ? new Date(position.openTime) : null,
      closedAt: position.closeTime ? new Date(position.closeTime) : null,
      openPrice: position.openPrice == null ? null : Number(position.openPrice),
      closePrice: position.closePrice == null ? null : Number(position.closePrice),
      marketPrice: position.closePrice == null ? null : Number(position.closePrice),
      profit: position.profit == null ? 0 : Number(position.profit),
      sl: position.sl == null ? null : Number(position.sl),
      tp: position.tp == null ? null : Number(position.tp),
      swap: position.swap == null ? null : Number(position.swap),
      commission: position.commission == null ? null : Number(position.commission),
      comment: position.comment ?? null,
    }));
  const scopedPositionTrades = orderedScopedPositions.map((position) => ({
    dealId: position.positionNo ?? "",
    symbol: position.symbol ?? "UNKNOWN",
    side: normalizeTradeSide(position.type, position.type),
    volume: position.volume ?? 0,
    time: position.closeTime ?? position.reportDate ?? new Date(0),
    price: position.closePrice == null ? null : Number(position.closePrice),
    pnl: positionNetPnl(position),
  }));
  const recentPositionDeals = [...scopedPositionTrades]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 30);
  const positionNetValues = closedPositionSummary.netValues;
  const positionRunAmounts = computeConsecutiveRunAmounts(positionNetValues);
  const positionsDrawdown = computeBalanceDrawdown(deals, since, null);
  const totalNet = closedPositionSummary.totalNetProfit;
  const totalTrackedTrades = scopedPositionTrades.length + openPositionsPayload.length;
  const largestProfitTrade = closedPositionSummary.largestProfitTrade;
  const largestLossTrade = closedPositionSummary.largestLossTrade;

  const positionsPayload: PositionsResponse = {
    timeframe,
    account,
    summary: {
      dealCount: closedPositionSummary.totalTrades,
      totalTrades: closedPositionSummary.totalTrades,
      tradeActivityPercent: totalTrackedTrades ? (openPositionsPayload.length / totalTrackedTrades) * 100 : 0,
      tradesPerWeek: computeTradesPerWeek(timeframe, scopedClosedPositions),
      longTradeWin: getLongTradeWinPercent(scopedClosedPositions),
      shortTradeWin: getShortTradeWinPercent(scopedClosedPositions),
      averageHoldHours: computeAverageHoldHours(scopedClosedPositions),
      profitFactor: closedPositionSummary.profitFactor,
      recoveryFactor: positionsDrawdown.maximalAmount > 0 ? totalNet / positionsDrawdown.maximalAmount : null,
      sharpeRatio: computeSharpeRatio(positionNetValues),
      expectedPayoff: closedPositionSummary.expectedPayoff,
      maxConsecutiveProfitAmount: positionRunAmounts.maxConsecutiveProfitAmount,
      maxConsecutiveLossAmount: positionRunAmounts.maxConsecutiveLossAmount,
      symbolTradePercent: buildSymbolTradePercent(scopedClosedPositions),
      openCount: openPositionsPayload.length,
      floatingProfit: openPositionsPayload.reduce((total, position) => total + Number(position.floatingProfit ?? 0), 0),
    },
    openPositions: openPositionsPayload,
    workingOrders: [],
    openBySymbol,
    historyPositions: historyPositions as any,
    recentDeals: recentPositionDeals as any,
  };

  const tradingDealsForProfit = tradingDeals.map((trade) => ({
    ...trade,
    pnl: dealNet(trade),
  }));
  const netProfit = tradingDealsForProfit.reduce((total, trade) => total + trade.pnl, 0);
  const grossProfit = tradingDealsForProfit.filter((trade) => trade.pnl > 0).reduce((total, trade) => total + trade.pnl, 0);

  const bySymbol = Array.from(
    tradingDealsForProfit.reduce<Map<string, { symbol: string; trades: number; netProfit: number; wins: number }>>((groups, trade) => {
      const symbol = trade.symbol || "UNKNOWN";
      const current = groups.get(symbol) ?? {
        symbol,
        trades: 0,
        netProfit: 0,
        wins: 0,
      };

      current.trades += 1;
      current.netProfit += trade.pnl;
      if (trade.pnl > 0) {
        current.wins += 1;
      }

      groups.set(symbol, current);
      return groups;
    }, new Map()).values(),
  )
    .map((item) => ({
      symbol: item.symbol,
      trades: item.trades,
      netProfit: item.netProfit,
      avgTrade: item.trades ? item.netProfit / item.trades : 0,
      winRate: item.trades ? (item.wins / item.trades) * 100 : 0,
    }))
    .sort((left, right) => Math.abs(right.netProfit) - Math.abs(left.netProfit));

  const recentDeals = [...tradingDealsForProfit]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 8)
    .map((trade) => ({
      dealId: trade.dealNo ?? "",
      symbol: trade.symbol || "UNKNOWN",
      side: trade.direction ?? trade.type,
      volume: trade.volume ?? 0,
      time: trade.time,
      price: trade.price == null ? null : Number(trade.price),
      pnl: trade.pnl,
    }));

  const profitDetail: ProfitDetailResponse = {
    timeframe,
    account,
    summary: {
      netProfit,
      grossProfit,
      grossLoss,
      totalCommission: tradingDealsForProfit.reduce((total, trade) => total + Number(trade.commission ?? 0), 0),
      totalSwap: tradingDealsForProfit.reduce((total, trade) => total + Number(trade.swap ?? 0), 0),
      totalDeposit: fundingTotals.totalDeposit,
      totalWithdrawal: fundingTotals.totalWithdraw,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
      dailyProfit: buildDailyProfitSeries(scopedDeals, 5, reportTime),
    },
    bySymbol,
    recentDeals: recentDeals as any,
  };

  const totalTrades = closedPositionSummary.totalTrades;

  const winBySymbol = Array.from(
    scopedPositionTrades.reduce<Map<string, { symbol: string; trades: number; wins: number; netProfit: number }>>((groups, trade) => {
      const symbol = trade.symbol || "UNKNOWN";
      const current = groups.get(symbol) ?? {
        symbol,
        trades: 0,
        wins: 0,
        netProfit: 0,
      };

      current.trades += 1;
      current.netProfit += trade.pnl;
      if (trade.pnl > 0) {
        current.wins += 1;
      }

      groups.set(symbol, current);
      return groups;
    }, new Map()).values(),
  )
    .map((item) => ({
      symbol: item.symbol,
      trades: item.trades,
      netProfit: item.netProfit,
      winRate: item.trades ? (item.wins / item.trades) * 100 : 0,
    }))
    .sort((left, right) => right.winRate - left.winRate);

  const bySide = Array.from(
    scopedPositionTrades.reduce<Map<string, { side: string; trades: number; wins: number; netProfit: number }>>((groups, trade) => {
      const side = trade.side || "unknown";
      const current = groups.get(side) ?? {
        side,
        trades: 0,
        wins: 0,
        netProfit: 0,
      };

      current.trades += 1;
      current.netProfit += trade.pnl;
      if (trade.pnl > 0) {
        current.wins += 1;
      }

      groups.set(side, current);
      return groups;
    }, new Map()).values(),
  ).map((item) => ({
    side: item.side,
    trades: item.trades,
    netProfit: item.netProfit,
    winRate: item.trades ? (item.wins / item.trades) * 100 : 0,
  }));

  const outcomeSeries = [...scopedPositionTrades]
    .slice(-30)
    .map((trade) => ({
      x: toIso(trade.time),
      y: trade.pnl,
    }));

  const streakAverages = computeAverageStreaks(positionNetValues);
  const hasTrades = totalTrades > 0;
  const sharpeRatio = computeSharpeRatio(positionNetValues);

  const winDetail: WinDetailResponse = {
    timeframe,
    account,
    summary: {
      winRate: closedPositionSummary.winPercent,
      wins: closedPositionSummary.profitTradesCount,
      losses: closedPositionSummary.lossTradesCount,
      longTradeWin: getLongTradeWinPercent(scopedClosedPositions),
      shortTradeWin: getShortTradeWinPercent(scopedClosedPositions),
      largestProfitTrade,
      largestLossTrade,
      sharpeRatio,
      profitFactor: closedPositionSummary.profitFactor,
      recoveryFactor: positionsDrawdown.maximalAmount > 0 ? totalNet / positionsDrawdown.maximalAmount : null,
      expectedPayoff: closedPositionSummary.expectedPayoff,
      maximumConsecutiveWins: hasTrades ? closedPositionSummary.maximumConsecutiveWins : null,
      maximumConsecutiveLosses: hasTrades ? closedPositionSummary.maximumConsecutiveLosses : null,
      maximumConsecutiveProfitAmount: positionRunAmounts.maxConsecutiveProfitAmount,
      averageConsecutiveWins: hasTrades ? streakAverages.averageWins : null,
      averageConsecutiveLosses: hasTrades ? streakAverages.averageLosses : null,
    },
    bySymbol: winBySymbol,
    bySide,
    outcomeSeries,
  };

  return {
    overview,
    balanceDetail,
    growth,
    positions: positionsPayload,
    profitDetail,
    winDetail,
  } satisfies CachedTimeframeViews;
}

async function rebuildAccountCache(accountId: string, versionKey: string): Promise<AccountPreaggregatedBundle | null> {
  const bundle = await getAccountBundle(accountId);
  if (!bundle) {
    accountCache.delete(accountId);
    return null;
  }

  const account = serializeAccountBundle(bundle);
  if (!account) {
    accountCache.delete(accountId);
    return null;
  }

  const reportTime = getAccountAnchorDate(bundle);
  const deals = bundle.account.deals as DealRow[];
  const positions = bundle.account.positions as PositionRow[];
  const openPositions = bundle.account.openPositions as OpenPositionRow[];
  const latestSnapshotBalance = Number(bundle.latestSnapshot?.balance ?? 0);
  const latestSnapshotEquity = Number(bundle.latestSnapshot?.equity ?? 0);
  const latestSnapshotMargin = Number(bundle.latestSnapshot?.margin ?? 0);

  const timeframeEntries = TIMEFRAMES.map((timeframe) => [
    timeframe,
    buildTimeframeView({
      timeframe,
      account,
      deals,
      positions,
      openPositions,
      latestSnapshotBalance,
      latestSnapshotEquity,
      latestSnapshotMargin,
      reportTime,
    }),
  ]) as Array<[Timeframe, CachedTimeframeViews]>;

  const cached: AccountPreaggregatedBundle = {
    accountId,
    versionKey,
    lastCheckedAt: Date.now(),
    timeframes: Object.fromEntries(timeframeEntries) as Record<Timeframe, CachedTimeframeViews>,
  };

  accountCache.set(accountId, cached);
  return cached;
}

async function getAccountPreaggregatedBundle(accountId: string) {
  const existing = accountCache.get(accountId);
  const now = Date.now();

  if (existing && now - existing.lastCheckedAt < ACCOUNT_CACHE_REVALIDATE_MS) {
    return existing;
  }

  const probe = await getAccountVersionProbe(accountId);
  if (!probe) {
    accountCache.delete(accountId);
    return null;
  }

  if (existing && existing.versionKey === probe.versionKey) {
    existing.lastCheckedAt = now;
    return existing;
  }

  return rebuildAccountCache(accountId, probe.versionKey);
}

export type AccountCachedViewKind =
  | "overview"
  | "balanceDetail"
  | "growth"
  | "positions"
  | "profitDetail"
  | "winDetail";

export function parseRequestTimeframe(rawTimeframe: string | null) {
  return parseTimeframe(rawTimeframe);
}

export async function getCachedAccountView(accountId: string, timeframe: Timeframe, kind: AccountCachedViewKind) {
  const cached = await getAccountPreaggregatedBundle(accountId);
  if (!cached) {
    return null;
  }

  return cached.timeframes[timeframe][kind];
}

export function warmAccountOverviewCaches(accountIds: string[]) {
  for (const accountId of accountIds) {
    void getCachedAccountView(accountId, "all", "overview");
  }
}
