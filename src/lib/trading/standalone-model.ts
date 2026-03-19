import type { ParsedReport } from "../parser";

export type StandaloneTimeframe = "day" | "week" | "month" | "year" | "all-time";

export interface StandaloneMetric {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "warning" | "neutral" | "muted";
}

export interface StandaloneRow {
  lead: string;
  sub: string;
  trail: string;
  trailSub: string;
  tone?: "positive" | "negative" | "warning" | "neutral" | "muted";
  side?: string;
}

export interface StandalonePanel {
  eyebrow: string;
  title: string;
  summary: string;
  metrics?: StandaloneMetric[];
  rows?: StandaloneRow[];
  chart?: Array<{ x: string; y: number }>;
  footnote?: string;
  empty: string;
}

export interface StandaloneFrame {
  timeframe: StandaloneTimeframe;
  label: string;
  context: string;
  overview: {
    trades: number;
    winPercent: number;
    netProfit: number;
    drawdown: number;
    growth: number;
    absoluteGain: number;
    equity: number;
    openCount: number;
  };
  curve: Array<{ x: string; y: number }>;
  panels: {
    profit: StandalonePanel;
    drawdown: StandalonePanel;
    win: StandalonePanel;
    trades: StandalonePanel;
    openPositions: StandalonePanel;
  };
}

export interface StandaloneReportDetail {
  report: {
    fileName: string;
    reportTimestamp: string;
  };
  summary: {
    balance: number;
    equity: number;
    floatingProfit: number;
    margin: number;
    freeMargin: number;
    marginLevel: number | null;
    openCount: number;
    workingCount: number;
    resultCount: number;
    openVolume: number;
    resultVolume: number;
    grossProfit: number;
    grossLoss: number;
    netProfit: number;
    commissionTotal: number;
    swapTotal: number;
    winRate: number;
    bestTrade: number | null;
    worstTrade: number | null;
  };
  balanceDrawdown: {
    amount: number;
    percent: number;
    peakBalance: number;
    troughBalance: number;
  };
  tradeStats: {
    totalTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number;
    lossRate: number;
    totalVolume: number;
    averageVolume: number;
    avgTradeNet: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number | null;
    expectancy: number;
    bestTrade: number | null;
    worstTrade: number | null;
    bestWinStreak: number;
    worstLossStreak: number;
    longTrades: number;
    shortTrades: number;
    longWinRate: number;
    shortWinRate: number;
  };
  equityCurve: Array<{
    x: string;
    equity: number;
    balance: number;
    eventType: string | null;
    eventDelta: number | null;
  }>;
  balanceOperations: Array<{
    time: string;
    type: string | null;
    delta: number;
    balanceAfter: number;
  }>;
  openPositions: Array<{
    positionId: string;
    openedAt: string | null;
    symbol: string;
    side: string;
    volume: number;
    openPrice: number;
    sl: number | null;
    tp: number | null;
    marketPrice: number;
    floatingProfit: number;
    swap: number;
    comment: string | null;
  }>;
  workingOrders: Array<{
    orderId: string;
    openedAt: string | null;
    symbol: string;
    type: string;
    volume: number;
    price: number;
    sl: number | null;
    tp: number | null;
    marketPrice: number | null;
    state: string;
    comment: string | null;
  }>;
  results: Array<{
    dealId: string;
    symbol: string;
    side: string;
    volume: number;
    time: string;
    price: number | null;
    profit: number;
    swap: number;
    commission: number;
    net: number;
    comment: string | null;
  }>;
}

export interface StandaloneGrowthSeries {
  summary: {
    ytdGrowth: number;
    allTimeGrowth: number;
    ytdAbsoluteGain: number;
    allTimeAbsoluteGain: number;
  };
  series: {
    monthly: Array<{ month: string; value: number }>;
    yearly: Array<{ year: number; value: number }>;
  };
}

export interface StandaloneAccountModel {
  id: string;
  name: string;
  ownerName: string;
  currency: string;
  server: string;
  status: "Active" | "Inactive";
  balance: number;
  equity: number;
  floatingProfit: number;
  marginLevel: number | null;
  frames: Record<StandaloneTimeframe, StandaloneFrame>;
  growth: StandaloneGrowthSeries;
  detail: StandaloneReportDetail;
}

export interface StandaloneParsedReportJson {
  fileName: string;
  fileHash: string;
  metadata: {
    account_number: string;
    owner_name: string;
    company?: string;
    currency: string;
    server: string;
    report_timestamp: string;
  };
  accountSummary: ParsedReport["accountSummary"];
  dealLedger: Array<{
    dealId: string;
    time: string;
    symbol: string;
    type: string;
    direction: string | null;
    volume: number;
    price: number;
    orderId: string | null;
    commission: number;
    fee: number;
    swap: number;
    profit: number;
    balanceAfter: number | null;
    comment: string;
  }>;
  openPositions: Array<{
    positionId: string;
    openedAt: string | null;
    symbol: string;
    side: string;
    volume: number;
    openPrice: number;
    sl: number | null;
    tp: number | null;
    marketPrice: number;
    floatingProfit: number;
    swap: number;
    comment: string;
  }>;
  workingOrders: Array<{
    orderId: string;
    openedAt: string | null;
    symbol: string;
    type: string;
    volumeRequested: number | null;
    volumeFilled: number | null;
    price: number | null;
    sl: number | null;
    tp: number | null;
    marketPrice: number | null;
    state: string;
    comment: string;
  }>;
}

export interface StandaloneMonitorData {
  generatedAt: string;
  reports: StandaloneParsedReportJson[];
  accs: StandaloneAccountModel[];
}

const TIMEFRAME_META: Record<StandaloneTimeframe, { label: string; context: string }> = {
  day: { label: "D", context: "Today" },
  week: { label: "W", context: "This week" },
  month: { label: "M", context: "MTD" },
  year: { label: "Y", context: "YTD" },
  "all-time": { label: "A", context: "All time" },
};

function iso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function buildTradingResults(report: ParsedReport) {
  return report.dealLedger
    .filter((deal) => isTradingDeal(deal.type))
    .map((deal) => ({
      dealId: deal.dealId,
      symbol: deal.symbol || "UNKNOWN",
      side: deal.direction || deal.type || "UNKNOWN",
      volume: Number(deal.volume ?? 0),
      time: deal.time,
      price: deal.price ?? null,
      profit: Number(deal.profit ?? 0),
      swap: Number(deal.swap ?? 0),
      commission: Number(deal.commission ?? 0),
      net: dealNet(deal),
      comment: deal.comment || null,
    }));
}

function formatCurrency(value: number | null | undefined, digits = 0) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value ?? 0))}`;
}

function formatSignedCurrency(value: number | null | undefined, digits = 0) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = Number(value ?? 0);
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(numeric), digits)}`;
}

function formatPlainPercent(value: number | null | undefined, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${Math.abs(Number(value)).toFixed(digits)}%`;
}

function toneFromNumber(value: number | null | undefined): StandaloneMetric["tone"] {
  if (!Number.isFinite(value)) {
    return "muted";
  }
  if (Number(value) > 0) {
    return "positive";
  }
  if (Number(value) < 0) {
    return "negative";
  }
  return "neutral";
}

function toneFromRate(value: number | null | undefined, benchmark = 50): StandaloneMetric["tone"] {
  if (!Number.isFinite(value)) {
    return "muted";
  }
  if (Number(value) > benchmark) {
    return "positive";
  }
  if (Number(value) < benchmark) {
    return "negative";
  }
  return "neutral";
}

function filterBySince<T>(rows: T[], getTimestamp: (row: T) => Date | string, since: Date | null) {
  if (!since) {
    return rows;
  }

  const minimum = since.getTime();
  return rows.filter((row) => new Date(getTimestamp(row)).getTime() >= minimum);
}

function dealNet(row: { profit?: number | null; commission?: number | null; swap?: number | null }) {
  return Number(row.profit ?? 0) + Number(row.commission ?? 0) + Number(row.swap ?? 0);
}

function dealProfit(row: { profit?: number | null }) {
  return Number(row.profit ?? 0);
}

function normalizeDealType(type: string | null | undefined) {
  return typeof type === "string" ? type.trim().toLowerCase() : "";
}

function isBalanceDeal(type: string | null | undefined) {
  return normalizeDealType(type).includes("balance");
}

function isFundingDeal(type: string | null | undefined) {
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

function isTradingDeal(type: string | null | undefined) {
  const normalized = normalizeDealType(type);
  if (!normalized || isFundingDeal(normalized)) {
    return false;
  }

  return normalized.includes("buy") || normalized.includes("sell");
}

function getLatestDealBalance(
  deals: Array<{ time: Date | string; dealId?: string; balanceAfter?: number | null }>,
  fallback = 0,
) {
  const sorted = [...deals].sort((left, right) => {
      const delta = new Date(left.time).getTime() - new Date(right.time).getTime();
      return delta !== 0 ? delta : String(left.dealId ?? "").localeCompare(String(right.dealId ?? ""));
    });

  let latestBalance = fallback;
  for (const deal of sorted) {
    const balanceAfter = Number(deal.balanceAfter ?? Number.NaN);
    if (Number.isFinite(balanceAfter)) {
      latestBalance = balanceAfter;
    }
  }

  return latestBalance;
}

function getSinceDate(timeframe: StandaloneTimeframe, reportTime: Date) {
  const now = new Date(reportTime);
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
    case "all-time":
      return null;
  }
}

function getAccountStatus(reportTimestamp: Date, activeWindowMinutes = 15) {
  return Date.now() - reportTimestamp.getTime() <= activeWindowMinutes * 60_000 ? "Active" : "Inactive";
}

function buildBalanceEquityCurve(
  deals: Array<{ time: Date | string; balanceAfter?: number | null; dealId?: string }>,
) {
  return [...deals]
    .sort((left, right) => {
      const delta = new Date(left.time).getTime() - new Date(right.time).getTime();
      return delta !== 0 ? delta : String(left.dealId ?? "").localeCompare(String(right.dealId ?? ""));
    })
    .map((deal) => ({
      time: deal.time,
      balance: Number(deal.balanceAfter ?? 0),
      equity: Number(deal.balanceAfter ?? 0),
    }))
    .filter((point) => Number.isFinite(point.balance));
}

function buildUnitDrawdownCurve(
  deals: Array<{
    time: Date | string;
    type?: string | null;
    profit?: number | null;
    commission?: number | null;
    swap?: number | null;
    balanceAfter?: number | null;
    dealId?: string;
  }>,
) {
  const sorted = [...deals]
    .filter((deal) => isTradingDeal(deal.type))
    .sort((left, right) => {
      const delta = new Date(left.time).getTime() - new Date(right.time).getTime();
      return delta !== 0 ? delta : String(left.dealId ?? "").localeCompare(String(right.dealId ?? ""));
    });

  if (!sorted.length) {
    return [] as Array<{
      time: Date;
      equity: number;
      drawdownPercent: number;
    }>;
  }

  let highWaterMark = Number.NEGATIVE_INFINITY;

  return sorted.flatMap((deal) => {
    const equity = Number(deal.balanceAfter ?? 0);
    if (!Number.isFinite(equity)) {
      return [];
    }

    if (!Number.isFinite(highWaterMark)) {
      highWaterMark = equity;
    }

    highWaterMark = Math.max(highWaterMark, equity);
    const drawdownPercent = highWaterMark > 0 ? ((highWaterMark - equity) / highWaterMark) * 100 : 0;

    return [{
      time: new Date(deal.time),
      equity,
      drawdownPercent,
    }];
  });
}

function calculateMaxDrawdown(
  deals: Array<{
    time: Date | string;
    type?: string | null;
    profit?: number | null;
    commission?: number | null;
    swap?: number | null;
    balanceAfter?: number | null;
    dealId?: string;
  }>,
) {
  return buildUnitDrawdownCurve(deals).reduce((maximum, point) => Math.max(maximum, point.drawdownPercent), 0);
}

function deriveStartingBalanceFromDeal(deal: {
    profit?: number | null;
    commission?: number | null;
    swap?: number | null;
    balanceAfter?: number | null;
  }) {
  return Number(deal.balanceAfter ?? 0) - dealNet(deal);
}

function collectDealWindow(
  deals: Array<{
    time: Date | string;
    dealId?: string;
    type?: string | null;
    profit?: number | null;
    commission?: number | null;
    swap?: number | null;
    balanceAfter?: number | null;
  }>,
  start: Date | null,
  end: Date | null = null,
) {
  const sorted = [...deals].sort((left, right) => {
    const delta = new Date(left.time).getTime() - new Date(right.time).getTime();
    return delta !== 0 ? delta : String(left.dealId ?? "").localeCompare(String(right.dealId ?? ""));
  });
  if (!sorted.length) {
    return { window: [] as typeof deals, startBalance: 0, endBalance: 0 };
  }

  const startTimestamp = start ? start.getTime() : null;
  const endTimestamp = end ? end.getTime() : null;
  let runningBalance = deriveStartingBalanceFromDeal(sorted[0]);
  let startBalance = runningBalance;
  const window: typeof deals = [];

  for (const deal of sorted) {
    const timestamp = new Date(deal.time).getTime();
    const balanceAfter = Number(deal.balanceAfter ?? runningBalance);

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

  const endBalance = window.length ? Number(window[window.length - 1].balanceAfter ?? runningBalance) : startBalance;
  return { window, startBalance, endBalance: Number.isFinite(endBalance) ? endBalance : startBalance };
}

function computeCompoundedGrowth(
  deals: Array<{
    time: Date | string;
    dealId?: string;
    type?: string | null;
    profit?: number | null;
    commission?: number | null;
    swap?: number | null;
    balanceAfter?: number | null;
  }>,
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
    const balanceAfter = Number(deal.balanceAfter ?? previousBalance);
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
  return Number.isFinite(growth) ? growth : 0;
}

function computeAbsoluteGain(
  deals: Array<{
    time: Date | string;
    dealId?: string;
    type?: string | null;
    profit?: number | null;
    commission?: number | null;
    swap?: number | null;
    balanceAfter?: number | null;
  }>,
  start: Date | null,
  end: Date | null = null,
) {
  const { window, startBalance, endBalance } = collectDealWindow(deals, start, end);
  if (!window.length) {
    return 0;
  }

  const fundingDelta = window.reduce((total, deal) => isFundingDeal(deal.type) ? total + dealNet(deal) : total, 0);
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

function computeStreaks(values: number[]) {
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

function computeTradesPerWeek(timeframe: StandaloneTimeframe, totalTrades: number, recentDeals: Array<{ time: Date }>) {
  let weeks: number | null;
  switch (timeframe) {
    case "day":
      weeks = 1 / 7;
      break;
    case "week":
      weeks = 1;
      break;
    case "month":
      weeks = 4.35;
      break;
    case "year":
      weeks = 52;
      break;
    case "all-time": {
      if (recentDeals.length < 2) {
        weeks = null;
        break;
      }
      const newest = recentDeals[0].time.getTime();
      const oldest = recentDeals[recentDeals.length - 1].time.getTime();
      weeks = Number.isFinite(newest) && Number.isFinite(oldest) && oldest < newest ? Math.max(1, (newest - oldest) / 604_800_000) : null;
      break;
    }
  }

  return weeks ? totalTrades / weeks : null;
}

function computeBalanceDrawdown(
  deals: Array<{
    time: Date | string;
    type?: string | null;
    profit?: number | null;
    commission?: number | null;
    swap?: number | null;
    balanceAfter?: number | null;
  }>,
  endingAdjustedBalance: number,
) {
  if (!deals.length) {
    return {
      amount: 0,
      percent: 0,
      peakBalance: endingAdjustedBalance,
      troughBalance: endingAdjustedBalance,
    };
  }

  let runningPeak = Number.NEGATIVE_INFINITY;
  let peakBalance = endingAdjustedBalance;
  let troughBalance = endingAdjustedBalance;
  let amount = 0;
  let percent = 0;

  for (const deal of deals.filter((item) => isTradingDeal(item.type))) {
    const adjustedBalance = Number(deal.balanceAfter ?? 0);
    if (!Number.isFinite(adjustedBalance)) {
      continue;
    }

    if (!Number.isFinite(runningPeak) || adjustedBalance > runningPeak) {
      runningPeak = adjustedBalance;
    }

    const currentAmount = runningPeak - adjustedBalance;
    const currentPercent = runningPeak > 0 ? (currentAmount / runningPeak) * 100 : 0;
    if (currentPercent > percent) {
      percent = currentPercent;
      amount = currentAmount;
      peakBalance = runningPeak;
      troughBalance = adjustedBalance;
    }
  }

  return {
    amount,
    percent,
    peakBalance,
    troughBalance,
  };
}

function displayName(ownerName: string, accountNumber: string) {
  const normalized = ownerName.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return `#${accountNumber}`;
  }

  return normalized.split(" ")[0] || normalized;
}

function serializeReport(report: ParsedReport, fileName: string): StandaloneParsedReportJson {
  return {
    fileName,
    fileHash: report.fileHash,
    metadata: {
      account_number: report.metadata.account_number,
      owner_name: report.metadata.owner_name,
      company: report.metadata.company,
      currency: report.metadata.currency,
      server: report.metadata.server,
      report_timestamp: report.metadata.report_timestamp.toISOString(),
    },
    accountSummary: report.accountSummary,
    dealLedger: report.dealLedger.map((row) => ({
      ...row,
      symbol: row.symbol ?? "UNKNOWN",
      volume: Number(row.volume ?? 0),
      price: Number(row.price ?? 0),
      comment: row.comment ?? "",
      time: row.time.toISOString(),
    })),
    openPositions: report.openPositions.map((row) => ({
      ...row,
      comment: row.comment ?? "",
      openedAt: iso(row.openedAt),
    })),
    workingOrders: report.workingOrders.map((row) => ({
      ...row,
      comment: row.comment ?? "",
      openedAt: iso(row.openedAt),
    })),
  };
}

function buildGrowthSeries(report: ParsedReport): StandaloneGrowthSeries {
  const reportTimestamp = report.metadata.report_timestamp;
  const year = reportTimestamp.getFullYear();
  const deals = report.dealLedger;
  const allTimeGrowth = computeCompoundedGrowth(deals, null);
  const ytdGrowth = computeCompoundedGrowth(
    deals,
    new Date(year, 0, 1, 0, 0, 0, 0),
    new Date(year, 11, 31, 23, 59, 59, 999),
  );
  const allTimeAbsoluteGain = computeAbsoluteGain(deals, null);
  const ytdAbsoluteGain = computeAbsoluteGain(
    deals,
    new Date(year, 0, 1, 0, 0, 0, 0),
    new Date(year, 11, 31, 23, 59, 59, 999),
  );

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
  const rangeStart = Math.max(firstYear, year - 4);
  const yearly = Array.from({ length: year - rangeStart + 1 }, (_, index) => {
    const itemYear = rangeStart + index;
    return {
      year: itemYear,
      value: computeCompoundedGrowth(
        deals,
        new Date(itemYear, 0, 1, 0, 0, 0, 0),
        new Date(itemYear, 11, 31, 23, 59, 59, 999),
      ),
    };
  });

  return {
    summary: {
      ytdGrowth,
      allTimeGrowth,
      ytdAbsoluteGain,
      allTimeAbsoluteGain,
    },
    series: {
      monthly,
      yearly,
    },
  };
}

function buildReportDetail(report: ParsedReport, fileName: string): StandaloneReportDetail {
  const sortedDeals = [...report.dealLedger].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  const equityCurve = buildBalanceEquityCurve(sortedDeals).map((point, index) => {
    const deal = sortedDeals[index] ?? null;
    return {
      x: iso(point.time) ?? "",
      equity: point.equity,
      balance: point.balance,
      eventType: deal?.type ?? null,
      eventDelta: deal ? dealNet(deal) : null,
    };
  });

  const results = buildTradingResults(report)
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime());
  const chronologicalResults = [...results].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());

  const wins = results.filter((trade) => trade.net > 0).length;
  const losses = results.filter((trade) => trade.net < 0).length;
  const breakeven = results.length - wins - losses;
  const netProfit = results.reduce((total, trade) => total + trade.net, 0);
  const grossProfit = results.reduce((total, trade) => trade.net > 0 ? total + trade.net : total, 0);
  const grossLoss = Math.abs(results.reduce((total, trade) => trade.net < 0 ? total + trade.net : total, 0));
  const openVolume = report.openPositions.reduce((total, position) => total + Number(position.volume ?? 0), 0);
  const resultVolume = results.reduce((total, trade) => total + Number(trade.volume ?? 0), 0);
  const commissionTotal = results.reduce((total, trade) => total + Number(trade.commission ?? 0), 0);
  const swapTotal = results.reduce((total, trade) => total + Number(trade.swap ?? 0), 0);
  const avgTradeNet = results.length ? netProfit / results.length : 0;
  const avgWin = wins ? grossProfit / wins : 0;
  const avgLoss = losses ? grossLoss / losses : 0;
  const longTrades = results.filter((trade) => trade.side.toLowerCase() === "buy");
  const shortTrades = results.filter((trade) => trade.side.toLowerCase() === "sell");
  const longWins = longTrades.filter((trade) => trade.net > 0).length;
  const shortWins = shortTrades.filter((trade) => trade.net > 0).length;
  const streaks = computeStreaks(chronologicalResults.map((trade) => trade.net));
  const endingAdjustedBalance = sortedDeals.reduce((state, deal) => {
    const funding = isBalanceDeal(deal.type) ? state.funding + dealNet(deal) : state.funding;
    return {
      funding,
      adjustedBalance: Number(deal.balanceAfter ?? 0) - funding,
    };
  }, {
    funding: 0,
    adjustedBalance: report.accountSummary.balance ?? 0,
  }).adjustedBalance;

  const balanceDrawdown = computeBalanceDrawdown(sortedDeals, endingAdjustedBalance);
  const bestTrade = results.length ? Math.max(...results.map((trade) => trade.net)) : null;
  const worstTrade = results.length ? Math.min(...results.map((trade) => trade.net)) : null;

  return {
    report: {
      fileName,
      reportTimestamp: report.metadata.report_timestamp.toISOString(),
    },
      summary: {
      balance: report.accountSummary.balance ?? 0,
      equity: report.accountSummary.equity ?? 0,
      floatingProfit: report.accountSummary.floating_pl ?? 0,
      margin: report.accountSummary.margin ?? 0,
      freeMargin: report.accountSummary.free_margin ?? 0,
      marginLevel: report.accountSummary.margin_level || null,
      openCount: report.openPositions.length,
      workingCount: report.workingOrders.length,
      resultCount: results.length,
      openVolume,
      resultVolume,
      grossProfit: report.reportResults?.gross_profit ?? grossProfit,
      grossLoss: report.reportResults?.gross_loss ?? grossLoss,
      netProfit: report.reportResults?.total_net_profit ?? netProfit,
      commissionTotal: report.reportResults?.total_commission ?? commissionTotal,
      swapTotal: report.reportResults?.total_swap ?? swapTotal,
      winRate: results.length ? (wins / results.length) * 100 : 0,
      bestTrade,
      worstTrade,
    },
    balanceDrawdown,
    tradeStats: {
      totalTrades: results.length,
      wins,
      losses,
      breakeven,
      winRate: results.length ? (wins / results.length) * 100 : 0,
      lossRate: results.length ? (losses / results.length) * 100 : 0,
      totalVolume: resultVolume,
      averageVolume: results.length ? resultVolume / results.length : 0,
      avgTradeNet,
      avgWin,
      avgLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
      expectancy: avgTradeNet,
      bestTrade,
      worstTrade,
      bestWinStreak: streaks.bestWinStreak,
      worstLossStreak: streaks.worstLossStreak,
      longTrades: longTrades.length,
      shortTrades: shortTrades.length,
      longWinRate: longTrades.length ? (longWins / longTrades.length) * 100 : 0,
      shortWinRate: shortTrades.length ? (shortWins / shortTrades.length) * 100 : 0,
    },
    equityCurve,
    balanceOperations: sortedDeals
      .filter((deal) => isBalanceDeal(deal.type))
      .map((deal) => ({
        time: deal.time.toISOString(),
        type: deal.type,
        delta: dealNet(deal),
        balanceAfter: deal.balanceAfter ?? 0,
      }))
      .reverse(),
    openPositions: report.openPositions.map((position) => ({
      positionId: position.positionId,
      openedAt: iso(position.openedAt),
      symbol: position.symbol,
      side: position.side,
      volume: position.volume,
      openPrice: position.openPrice,
      sl: position.sl,
      tp: position.tp,
      marketPrice: position.marketPrice,
      floatingProfit: position.floatingProfit,
      swap: position.swap,
      comment: position.comment || null,
    })),
    workingOrders: report.workingOrders.map((order) => ({
      orderId: order.orderId,
      openedAt: iso(order.openedAt),
      symbol: order.symbol,
      type: order.type,
      volume: order.volumeFilled ?? order.volumeRequested ?? 0,
      price: Number(order.price ?? 0),
      sl: order.sl,
      tp: order.tp,
      marketPrice: order.marketPrice,
      state: order.state,
      comment: order.comment || null,
    })),
    results: results.map((trade) => ({
      ...trade,
      time: iso(trade.time) ?? "",
    })),
  };
}

function buildFrame(report: ParsedReport, timeframe: StandaloneTimeframe): StandaloneFrame {
  const reportTime = report.metadata.report_timestamp;
  const since = getSinceDate(timeframe, reportTime);
  const deals = timeframe === "all-time" ? report.dealLedger : filterBySince(report.dealLedger, (deal) => deal.time, since);
  const dealsForTimeframe = timeframe === "all-time"
    ? buildTradingResults(report)
    : filterBySince(buildTradingResults(report), (trade) => trade.time, since);
  const curve = buildBalanceEquityCurve(deals).map((point) => ({
    x: iso(point.time) ?? "",
    y: point.equity,
  }));
  const unitDrawdownCurve = buildUnitDrawdownCurve(deals);

  const netProfit = deals.reduce((total, deal) => total + (isTradingDeal(deal.type) ? dealNet(deal) : 0), 0);
  const wins = dealsForTimeframe.filter((trade) => dealNet(trade) > 0);
  const losses = dealsForTimeframe.filter((trade) => dealNet(trade) < 0);
  const profitBySymbol = Array.from(
    dealsForTimeframe.reduce<Map<string, { symbol: string; trades: number; wins: number; netProfit: number }>>((groups, trade) => {
      const symbol = trade.symbol || "UNKNOWN";
      const current = groups.get(symbol) ?? { symbol, trades: 0, wins: 0, netProfit: 0 };
      current.trades += 1;
      current.netProfit += dealNet(trade);
      if (dealNet(trade) > 0) {
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
    .sort((left, right) => right.netProfit - left.netProfit);

  const bySide = Array.from(
    dealsForTimeframe.reduce<Map<string, { side: string; trades: number; wins: number; netProfit: number }>>((groups, trade) => {
      const side = trade.side || "UNKNOWN";
      const current = groups.get(side) ?? { side, trades: 0, wins: 0, netProfit: 0 };
      current.trades += 1;
      current.netProfit += dealNet(trade);
      if (dealNet(trade) > 0) {
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

  const recentDeals = [...dealsForTimeframe]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 30);

  const tradesPerWeek = computeTradesPerWeek(timeframe, dealsForTimeframe.length, recentDeals);
  const activityPercent = dealsForTimeframe.length + report.openPositions.length + report.workingOrders.length
    ? ((report.openPositions.length + report.workingOrders.length) / (dealsForTimeframe.length + report.openPositions.length + report.workingOrders.length)) * 100
    : 0;

  const growth = timeframe === "all-time"
    ? computeCompoundedGrowth(report.dealLedger, null)
    : timeframe === "year"
      ? computeCompoundedGrowth(
          report.dealLedger,
          new Date(reportTime.getFullYear(), 0, 1, 0, 0, 0, 0),
          new Date(reportTime.getFullYear(), 11, 31, 23, 59, 59, 999),
        )
      : computeCompoundedGrowth(report.dealLedger, since, null);
  const absoluteGain = timeframe === "all-time"
    ? computeAbsoluteGain(report.dealLedger, null)
    : timeframe === "year"
      ? computeAbsoluteGain(
          report.dealLedger,
          new Date(reportTime.getFullYear(), 0, 1, 0, 0, 0, 0),
          new Date(reportTime.getFullYear(), 11, 31, 23, 59, 59, 999),
        )
      : computeAbsoluteGain(report.dealLedger, since, null);

  const drawdown = computeBalanceDrawdown(
    deals,
    getLatestDealBalance(deals, report.accountSummary.balance ?? 0),
  ).percent;
  const meta = TIMEFRAME_META[timeframe];
  const currentEquity = report.accountSummary.equity ?? 0;
  const peakEquity = unitDrawdownCurve.length ? Math.max(...unitDrawdownCurve.map((point) => point.equity)) : currentEquity;
  const outcomeSeries = [...dealsForTimeframe]
    .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime())
    .slice(-30)
    .map((trade) => ({
      x: iso(trade.time) ?? "",
      y: dealNet(trade),
    }));

  return {
    timeframe,
    label: meta.label,
    context: meta.context,
    overview: {
      trades: dealsForTimeframe.length,
      winPercent: dealsForTimeframe.length ? (wins.length / dealsForTimeframe.length) * 100 : 0,
      netProfit,
      drawdown,
      growth,
      absoluteGain,
      equity: currentEquity,
      openCount: report.openPositions.length,
    },
    curve,
    panels: {
      profit: {
        eyebrow: meta.context,
        title: "Profit detail",
        summary: `${dealsForTimeframe.length} trades`,
        metrics: [
          { label: "Net", value: formatSignedCurrency(netProfit), tone: toneFromNumber(netProfit) },
          { label: "Avg Trade", value: formatSignedCurrency(dealsForTimeframe.length ? netProfit / dealsForTimeframe.length : 0), tone: toneFromNumber(netProfit) },
          { label: "Gross Profit", value: formatCurrency(wins.reduce((total, trade) => total + dealNet(trade), 0)), tone: "muted" },
          {
            label: "Profit Factor",
            value: (() => {
              const grossProfit = wins.reduce((total, trade) => total + dealNet(trade), 0);
              const grossLoss = Math.abs(losses.reduce((total, trade) => total + dealNet(trade), 0));
              return grossLoss > 0 ? grossProfit / grossLoss : null;
            })()?.toFixed(2) ?? "-",
            tone: toneFromNumber((() => {
              const grossProfit = wins.reduce((total, trade) => total + dealNet(trade), 0);
              const grossLoss = Math.abs(losses.reduce((total, trade) => total + dealNet(trade), 0));
              return grossLoss > 0 ? grossProfit / grossLoss : null;
            })() ?? null),
          },
        ],
        rows: profitBySymbol.map((item) => ({
          lead: item.symbol,
          sub: `${item.trades} trades · ${formatPlainPercent(item.winRate)}`,
          trail: formatSignedCurrency(item.netProfit),
          trailSub: `Avg ${formatSignedCurrency(item.avgTrade)}`,
          tone: toneFromNumber(item.netProfit),
        })),
        empty: "Profit detail will appear once the selected timeframe includes deal history.",
      },
      drawdown: {
        eyebrow: meta.context,
        title: "Risk & drawdown",
        summary: `${formatPlainPercent(drawdown)} max DD`,
        metrics: [
          { label: "Max DD", value: formatPlainPercent(drawdown), tone: toneFromNumber(-drawdown) },
          { label: "Current Equity", value: formatCurrency(currentEquity) },
          { label: "Peak Equity", value: formatCurrency(peakEquity) },
          { label: "Recovery", value: drawdown ? (netProfit / drawdown).toFixed(2) : "-", tone: toneFromNumber(drawdown ? netProfit / drawdown : null) },
        ],
        chart: unitDrawdownCurve.map((point) => ({ x: point.time.toISOString(), y: point.drawdownPercent })),
        rows: buildBalanceEquityCurve(deals).slice(-4).reverse().map((point, index) => {
          const deal = [...deals].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()).slice(-4).reverse()[index];
          const delta = deal ? dealNet(deal) : 0;
          return {
            lead: isBalanceDeal(deal?.type) ? (delta >= 0 ? "Deposit" : "Withdrawal") : (deal?.type || "Balance"),
            sub: iso(point.time)?.replace("T", " ").slice(0, 16) ?? "-",
            trail: formatSignedCurrency(delta),
            trailSub: `Eq. ${formatCurrency(point.equity)}`,
            tone: toneFromNumber(delta),
          };
        }),
        empty: "Risk detail will appear once the selected timeframe has balance events.",
      },
      win: {
        eyebrow: meta.context,
        title: "Win statistics",
        summary: `${formatPlainPercent(dealsForTimeframe.length ? (wins.length / dealsForTimeframe.length) * 100 : 0)} win rate`,
        metrics: [
          { label: "Wins", value: String(wins.length), tone: "positive" },
          { label: "Losses", value: String(losses.length), tone: "negative" },
          { label: "Expectancy", value: formatSignedCurrency(dealsForTimeframe.length ? netProfit / dealsForTimeframe.length : 0), tone: toneFromNumber(netProfit) },
          { label: "Sharpe*", value: outcomeSeries.length > 1 ? (() => {
            const values = outcomeSeries.map((point) => point.y);
            const average = values.reduce((total, value) => total + value, 0) / values.length;
            const deviation = Math.sqrt(values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1));
            return deviation ? (average / deviation).toFixed(2) : "-";
          })() : "-", tone: "muted" },
        ],
        chart: outcomeSeries,
        rows: bySide.map((item) => ({
          lead: item.side,
          sub: `${item.trades} trades`,
          trail: formatPlainPercent(item.winRate),
          trailSub: formatSignedCurrency(item.netProfit),
          tone: toneFromRate(item.winRate),
        })),
        empty: "Win statistics will appear once the selected timeframe includes closed trades.",
      },
      trades: {
        eyebrow: meta.context,
        title: "Trades",
        summary: `${dealsForTimeframe.length} deals`,
        metrics: [
          { label: "Deals", value: String(dealsForTimeframe.length) },
          { label: "Open", value: String(report.openPositions.length) },
          { label: "Working", value: String(report.workingOrders.length) },
          { label: "Trades/Week", value: Number.isFinite(tradesPerWeek) ? tradesPerWeek!.toFixed(1) : "-", tone: toneFromNumber(tradesPerWeek) },
        ],
        rows: recentDeals.slice(0, 4).map((trade) => ({
          side: trade.side,
          lead: trade.symbol,
          sub: iso(trade.time)?.replace("T", " ").slice(0, 16) ?? "-",
          trail: formatSignedCurrency(dealNet(trade)),
          trailSub: `${trade.volume.toFixed(2)} lot`,
          tone: toneFromNumber(dealNet(trade)),
        })),
        footnote: `${formatPlainPercent(activityPercent)} of tracked rows are still pending or open.`,
        empty: "The latest report has no deals, open positions, or working orders to summarize here.",
      },
      openPositions: {
        eyebrow: "Live snapshot",
        title: "Open positions",
        summary: `${formatSignedCurrency(report.accountSummary.floating_pl ?? 0)} float`,
        rows: report.openPositions.map((position) => ({
          side: position.side,
          lead: position.symbol,
          sub: `${position.volume.toFixed(2)} lot`,
          trail: formatSignedCurrency(position.floatingProfit),
          trailSub: `${position.openPrice.toFixed(5)} -> ${position.marketPrice.toFixed(5)}`,
          tone: toneFromNumber(position.floatingProfit),
        })),
        empty: "There are no live positions in the latest imported snapshot.",
      },
    },
  };
}

export function buildStandaloneAccountModel(report: ParsedReport, fileName: string): StandaloneAccountModel {
  const reportTime = report.metadata.report_timestamp;
  const frames = {
    day: buildFrame(report, "day"),
    week: buildFrame(report, "week"),
    month: buildFrame(report, "month"),
    year: buildFrame(report, "year"),
    "all-time": buildFrame(report, "all-time"),
  } satisfies Record<StandaloneTimeframe, StandaloneFrame>;

  return {
    id: report.metadata.account_number,
    name: displayName(report.metadata.owner_name, report.metadata.account_number),
    ownerName: report.metadata.owner_name || `#${report.metadata.account_number}`,
    currency: report.metadata.currency || "USD",
    server: report.metadata.server || "UNKNOWN",
    status: getAccountStatus(reportTime),
    balance: getLatestDealBalance(report.dealLedger, report.accountSummary.balance ?? 0),
    equity: report.accountSummary.equity ?? 0,
    floatingProfit: report.accountSummary.floating_pl ?? 0,
    marginLevel: report.accountSummary.margin_level || null,
    frames,
    growth: buildGrowthSeries(report),
    detail: buildReportDetail(report, fileName),
  };
}

export function buildStandaloneMonitorData(input: Array<{ fileName: string; report: ParsedReport }>): StandaloneMonitorData {
  const latestByAccount = new Map<string, { fileName: string; report: ParsedReport }>();

  for (const item of input) {
    const key = item.report.metadata.account_number;
    const current = latestByAccount.get(key);
    if (!current || current.report.metadata.report_timestamp.getTime() < item.report.metadata.report_timestamp.getTime()) {
      latestByAccount.set(key, item);
    }
  }

  const reports = input
    .map(({ fileName, report }) => serializeReport(report, fileName))
    .sort((left, right) => left.metadata.account_number.localeCompare(right.metadata.account_number));

  const accs = [...latestByAccount.values()]
    .map(({ fileName, report }) => buildStandaloneAccountModel(report, fileName))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    generatedAt: new Date().toISOString(),
    reports,
    accs,
  };
}
