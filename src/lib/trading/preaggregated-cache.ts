import { prisma } from "@/lib/prisma";
import type {
  AccountOverviewResponse,
  BalanceDetailResponse,
  GrowthResponse,
  PositionsResponse,
  ProfitDetailResponse,
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
  computeStreaks,
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
  getTradeWinPercent,
  isBalanceDeal,
  isTradingDeal,
  normalizeTradeSide,
  parseTimeframe,
  serializeAccountBundle,
  serializeOpenPositions,
  summarizeClosedPositions,
  summarizeTrades,
} from "@/lib/trading/account-data";

const ACCOUNT_CACHE_REVALIDATE_MS = 5_000;
const TIMEFRAMES: Timeframe[] = ["1d", "5d", "1m", "3m", "6m", "1y", "all"];

type DealRow = {
  time: Date | string;
  type?: string | null;
  direction?: string | null;
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
  closePrice?: number | null;
  profit?: number | null;
  swap?: number | null;
  commission?: number | null;
};

type OpenPositionRow = {
  reportDate?: Date | string | null;
  profit?: number | null;
  floatingProfit?: number | null;
  floating_profit?: number | null;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
  dataCount = 24,
) {
  const sortedDeals = [...deals].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  const anchorTime = reportTime.getTime();
  const startTime = startOfLocalDay(reportTime).getTime();
  const endTime = startTime + dataCount * ONE_HOUR_MS;

  if (!sortedDeals.length) {
    return Array.from({ length: dataCount + 1 }, (_, index) => ({
      time: new Date(startTime + index * ONE_HOUR_MS),
      balance: endingBalance,
      eventType: null,
      eventDelta: null,
    }));
  }

  let runningBalance = deriveOpeningBalance(sortedDeals[0]);
  let dealIndex = 0;

  while (dealIndex < sortedDeals.length) {
    const timestamp = new Date(sortedDeals[dealIndex].time).getTime();
    if (!Number.isFinite(timestamp) || timestamp > startTime) {
      break;
    }

    const balanceAfter = getDealBalancePointValue(sortedDeals[dealIndex]);
    if (balanceAfter !== null) {
      runningBalance = balanceAfter;
    }
    dealIndex += 1;
  }

  const points = Array.from({ length: dataCount + 1 }, (_, index) => {
    const tickTime = startTime + index * ONE_HOUR_MS;

    if (tickTime <= anchorTime) {
      while (dealIndex < sortedDeals.length) {
        const deal = sortedDeals[dealIndex];
        const timestamp = new Date(deal.time).getTime();
        if (!Number.isFinite(timestamp) || timestamp > tickTime) {
          break;
        }

        const balanceAfter = getDealBalancePointValue(deal);
        if (balanceAfter !== null) {
          runningBalance = balanceAfter;
        }
        dealIndex += 1;
      }
    }

    return {
      time: new Date(tickTime),
      balance: tickTime > anchorTime || tickTime === endTime ? endingBalance : runningBalance,
      eventType: null,
      eventDelta: null,
    };
  });

  return points;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function computeTradesPerWeek(
  timeframe: Timeframe,
  rows: Array<{ closeTime: Date | string | null }>,
) {
  if (timeframe === "all") {
    return null;
  }

  const closed = rows.filter((row) => row.closeTime);
  if (closed.length < 2) {
    return null;
  }

  const sorted = [...closed].sort((left, right) => new Date(left.closeTime ?? 0).getTime() - new Date(right.closeTime ?? 0).getTime());
  const oldest = new Date(sorted[0].closeTime ?? 0).getTime();
  const newest = new Date(sorted[sorted.length - 1].closeTime ?? 0).getTime();

  if (!Number.isFinite(oldest) || !Number.isFinite(newest) || newest <= oldest) {
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
  const tradingDeals = scopedDeals.filter((deal) => isTradingDeal(deal.type));
  const sortedScopedDeals = [...scopedDeals].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  const scopedPositions = filterBySince(positions, (position) => position.closeTime, since);
  const closedPositionSummary = summarizeClosedPositions(scopedPositions);

  const endingBalance = Number.isFinite(latestSnapshotBalance) && latestSnapshotBalance > 0
    ? latestSnapshotBalance
    : account.balance;
  const balanceCurve = timeframe === "1d"
    ? buildRealtime24HourBalanceCurve(deals, reportTime, endingBalance, 24)
    : buildBalanceCurve(sortedScopedDeals, openPositions);
  const periodGrowth = timeframe === "all" ? computeAllTimeGrowth(deals) : computeCompoundedGrowth(deals, since, null);
  const drawdown = computeBalanceDrawdown(
    scopedDeals,
    scopedDeals.length ? Number(scopedDeals[scopedDeals.length - 1].balance ?? Number.NaN) : account.balance,
  );
  const outcomeSummary = summarizeTrades(tradingDeals);

  const overview: AccountOverviewResponse = {
    timeframe,
    account,
    kpis: {
      periodGrowth,
      netProfit: outcomeSummary.netProfit,
      drawdown: drawdown.percent,
      absoluteDrawdown: drawdown.amount,
      winPercent: closedPositionSummary.winPercent,
      trades: closedPositionSummary.totalTrades,
      floatingPL: openPositions.reduce((total, position) => total + Number(position.profit ?? 0), 0),
      openCount: openPositions.length,
    },
    balanceCurve: balanceCurve.map((point) => ({
      x: toIso(point.time),
      y: point.balance,
      balance: point.balance,
      eventType: point.eventType ?? null,
      eventDelta: point.eventDelta ?? null,
    })),
  };

  const unitDrawdownCurve = buildUnitDrawdownCurve(scopedDeals, openPositions);
  const losingPositions = scopedPositions.filter((position) => Number(position.profit ?? 0) < 0);
  const averageLossTrade = losingPositions.length
    ? losingPositions.reduce((total, position) => total + Math.abs(Number(position.profit ?? 0)), 0) / losingPositions.length
    : null;
  const currentDepositLoad =
    latestSnapshotEquity > 0
      ? (latestSnapshotMargin / latestSnapshotEquity) * 100
      : null;
  const runAmounts = computeConsecutiveRunAmounts(
    sortedScopedDeals
      .filter((deal) => isTradingDeal(deal.type))
      .map((deal) => Number(deal.profit ?? 0) + Number(deal.commission ?? 0) + Number(deal.swap ?? 0)),
  );

  const balanceDetail: BalanceDetailResponse = {
    timeframe,
    account,
    summary: {
      absoluteDrawdown: drawdown.amount,
      relativeDrawdownPct: drawdown.percent,
      maximalDrawdownAmount: drawdown.amount,
      maximalDrawdownPct: drawdown.percent,
      averageLossTrade,
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
      .filter((deal) => isBalanceDeal(deal.type))
      .map((deal) => ({
        time: toIso(deal.time),
        type: deal.type ?? null,
        delta: dealNet(deal),
      })),
  };

  const openPositionsPayload = serializeOpenPositions(openPositions as any);
  const orderedScopedPositions = [...scopedPositions].sort(
    (left, right) => new Date(left.closeTime ?? 0).getTime() - new Date(right.closeTime ?? 0).getTime(),
  );
  const scopedPositionTrades = orderedScopedPositions.map((position) => ({
    dealId: position.positionNo ?? "",
    symbol: position.symbol ?? "UNKNOWN",
    side: normalizeTradeSide(position.type, position.type),
    volume: position.volume ?? 0,
    time: position.closeTime ?? position.reportDate ?? new Date(0),
    price: position.closePrice == null ? null : Number(position.closePrice),
    pnl: Number(position.profit ?? 0) + Number(position.swap ?? 0) + Number(position.commission ?? 0),
  }));
  const recentPositionDeals = [...scopedPositionTrades]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 30);
  const positionNetValues = scopedPositionTrades.map((trade) => trade.pnl);
  const positionRunAmounts = computeConsecutiveRunAmounts(positionNetValues);
  const positionStreaks = computeStreaks(positionNetValues);
  const positionsDrawdown = computeBalanceDrawdown(scopedDeals, latestSnapshotBalance);
  const totalNet = positionNetValues.reduce((total, value) => total + value, 0);
  const positionGrossProfit = positionNetValues.filter((value) => value > 0).reduce((total, value) => total + value, 0);
  const positionGrossLoss = Math.abs(positionNetValues.filter((value) => value < 0).reduce((total, value) => total + value, 0));
  const totalTrackedTrades = scopedPositionTrades.length + openPositionsPayload.length;
  const largestProfitTrade = positionNetValues.length ? Math.max(...positionNetValues) : null;
  const largestLossTrade = positionNetValues.length ? Math.min(...positionNetValues) : null;

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

  const positionsPayload: PositionsResponse = {
    timeframe,
    account,
    summary: {
      dealCount: scopedPositionTrades.length,
      totalTrades: scopedPositionTrades.length,
      tradeActivityPercent: totalTrackedTrades ? (openPositionsPayload.length / totalTrackedTrades) * 100 : 0,
      tradesPerWeek: computeTradesPerWeek(timeframe, scopedPositions),
      longTradeWin: getLongTradeWinPercent(scopedPositions),
      shortTradeWin: getShortTradeWinPercent(scopedPositions),
      averageHoldHours: computeAverageHoldHours(scopedPositions),
      profitFactor: positionGrossLoss > 0 ? positionGrossProfit / positionGrossLoss : null,
      recoveryFactor: positionsDrawdown.amount > 0 ? totalNet / positionsDrawdown.amount : null,
      sharpeRatio: computeSharpeRatio(positionNetValues),
      expectedPayoff: scopedPositionTrades.length ? totalNet / scopedPositionTrades.length : null,
      maxConsecutiveProfitAmount: positionRunAmounts.maxConsecutiveProfitAmount,
      maxConsecutiveLossAmount: positionRunAmounts.maxConsecutiveLossAmount,
      symbolTradePercent: buildSymbolTradePercent(scopedPositions),
      openCount: openPositionsPayload.length,
      floatingProfit: openPositionsPayload.reduce((total, position) => total + Number(position.floatingProfit ?? 0), 0),
    },
    openPositions: openPositionsPayload,
    workingOrders: [],
    openBySymbol,
    recentDeals: recentPositionDeals as any,
  };

  const tradingDealsForProfit = scopedDeals.filter((deal) => isTradingDeal(deal.type)).map((trade) => ({
    ...trade,
    pnl: dealNet(trade),
  }));
  const netProfit = tradingDealsForProfit.reduce((total, trade) => total + trade.pnl, 0);
  const grossProfit = tradingDealsForProfit.filter((trade) => trade.pnl > 0).reduce((total, trade) => total + trade.pnl, 0);
  const grossLoss = Math.abs(tradingDealsForProfit.filter((trade) => trade.pnl < 0).reduce((total, trade) => total + trade.pnl, 0));
  const fundingTotals = buildFundingTotals(scopedDeals);

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
      dailyProfit: buildDailyProfitSeries(tradingDealsForProfit, 5, reportTime),
    },
    bySymbol,
    recentDeals: recentDeals as any,
  };

  const winningTrades = scopedPositionTrades.filter((trade) => trade.pnl > 0);
  const losingTrades = scopedPositionTrades.filter((trade) => trade.pnl < 0);
  const totalTrades = scopedPositionTrades.length;

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
  const hasTrades = scopedPositionTrades.length > 0;
  const winDrawdown = computeBalanceDrawdown(scopedDeals, latestSnapshotBalance);
  const sharpeRatio = computeSharpeRatio(positionNetValues);

  const winDetail: WinDetailResponse = {
    timeframe,
    account,
    summary: {
      winRate: totalTrades ? (winningTrades.length / totalTrades) * 100 : 0,
      wins: winningTrades.length,
      losses: losingTrades.length,
      longTradeWin: getLongTradeWinPercent(scopedPositions),
      shortTradeWin: getShortTradeWinPercent(scopedPositions),
      largestProfitTrade: largestProfitTrade !== null && largestProfitTrade > 0 ? largestProfitTrade : null,
      largestLossTrade: largestLossTrade !== null && largestLossTrade < 0 ? largestLossTrade : null,
      sharpeRatio,
      profitFactor: positionGrossLoss > 0 ? positionGrossProfit / positionGrossLoss : null,
      recoveryFactor: winDrawdown.amount > 0 ? totalNet / winDrawdown.amount : null,
      expectedPayoff: totalTrades ? totalNet / totalTrades : null,
      maximumConsecutiveWins: hasTrades ? positionStreaks.bestWinStreak : null,
      maximumConsecutiveLosses: hasTrades ? positionStreaks.worstLossStreak : null,
      maximumConsecutiveProfitAmount: positionRunAmounts.maxConsecutiveProfitAmount,
      averageConsecutiveWins: hasTrades ? (streakAverages.averageWins ?? 0) : null,
      averageConsecutiveLosses: hasTrades ? (streakAverages.averageLosses ?? 0) : null,
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
