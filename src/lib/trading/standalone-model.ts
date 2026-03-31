import type { ParsedReport } from "../parser";

export type StandaloneTimeframe = "day" | "week" | "month" | "year" | "all-time";

export interface StandaloneFrame {
  timeframe: StandaloneTimeframe;
  label: string;
  context: string;
  overview: {
    netProfit: number;
    drawdown: number;
    winPercent: number;
    trades: number;
    floatingPL: number;
    openCount: number;
  };
  curve: Array<{ x: string; y: number }>;
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
  reportTimestamp: string;
  balance: number;
  equity: number;
  floatingProfit: number;
  marginLevel: number | null;
  frames: Record<StandaloneTimeframe, StandaloneFrame>;
  growth: StandaloneGrowthSeries;
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

type DealRow = ParsedReport["dealLedger"][number];

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

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

function sortDeals<T extends { time: Date | string; dealId?: string }>(deals: T[]) {
  return [...deals].sort((left, right) => {
    const delta = new Date(left.time).getTime() - new Date(right.time).getTime();
    return delta !== 0 ? delta : String(left.dealId ?? "").localeCompare(String(right.dealId ?? ""));
  });
}

function filterBySince<T>(rows: T[], getTimestamp: (row: T) => Date | string, since: Date | null) {
  if (!since) {
    return rows;
  }

  const minimum = since.getTime();
  return rows.filter((row) => new Date(getTimestamp(row)).getTime() >= minimum);
}

function normalizeDealType(type: string | null | undefined) {
  return typeof type === "string" ? type.trim().toLowerCase() : "";
}

function dealNet(row: { profit?: number | null; commission?: number | null; swap?: number | null }) {
  return Number(row.profit ?? 0) + Number(row.commission ?? 0) + Number(row.swap ?? 0);
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

function deriveStartingBalanceFromDeal(deal: { balanceAfter?: number | null; profit?: number | null; commission?: number | null; swap?: number | null }) {
  const balanceAfter = Number(deal.balanceAfter ?? Number.NaN);
  if (!Number.isFinite(balanceAfter)) {
    return 0;
  }

  return balanceAfter - dealNet(deal);
}

function getLatestDealBalance(deals: Array<{ time: Date | string; dealId?: string; balanceAfter?: number | null }>, fallback = 0) {
  let latestBalance = fallback;

  for (const deal of sortDeals(deals)) {
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
  if (reportTimestamp.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
    return "Inactive";
  }

  return Date.now() - reportTimestamp.getTime() <= activeWindowMinutes * 60_000 ? "Active" : "Inactive";
}

function buildBalanceCurve(deals: DealRow[]) {
  let lastKnownBalance: number | null = null;

  return sortDeals(deals).flatMap((deal) => {
    const parsedBalance = Number(deal.balanceAfter ?? Number.NaN);
    if (Number.isFinite(parsedBalance)) {
      lastKnownBalance = parsedBalance;
    }

    if (!Number.isFinite(lastKnownBalance ?? Number.NaN)) {
      return [];
    }

    return [{
      time: deal.time,
      balance: Number(lastKnownBalance),
    }];
  });
}

function collectDealWindow(
  deals: DealRow[],
  start: Date | null,
  end: Date | null = null,
) {
  const sorted = sortDeals(deals);
  if (!sorted.length) {
    return { window: [] as DealRow[], startBalance: 0, endBalance: 0 };
  }

  const startTimestamp = start ? start.getTime() : null;
  const endTimestamp = end ? end.getTime() : null;
  let runningBalance = deriveStartingBalanceFromDeal(sorted[0]);
  let startBalance = runningBalance;
  const window: DealRow[] = [];

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

  const endBalance = window.length ? Number(window[window.length - 1].balanceAfter ?? runningBalance) : startBalance;
  return { window, startBalance, endBalance: Number.isFinite(endBalance) ? endBalance : startBalance };
}

function computeCompoundedGrowth(deals: DealRow[], start: Date | null, end: Date | null = null) {
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
  return Number.isFinite(growth) ? growth : 0;
}

function computeAbsoluteGain(deals: DealRow[], start: Date | null, end: Date | null = null) {
  const { window, startBalance, endBalance } = collectDealWindow(deals, start, end);
  if (!window.length) {
    return 0;
  }

  const fundingDelta = window.reduce((total, deal) => (isFundingDeal(deal.type) ? total + dealNet(deal) : total), 0);
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

function computeBalanceDrawdown(deals: DealRow[], endingBalance: number) {
  const tradingDeals = sortDeals(deals).filter((deal) => isTradingDeal(deal.type));
  if (!tradingDeals.length) {
    return 0;
  }

  let runningPeak = Number.NEGATIVE_INFINITY;
  let maxPercent = 0;

  for (const deal of tradingDeals) {
    const balance = Number(deal.balanceAfter ?? Number.NaN);
    if (!Number.isFinite(balance)) {
      continue;
    }

    if (!Number.isFinite(runningPeak)) {
      runningPeak = endingBalance || balance;
    }

    runningPeak = Math.max(runningPeak, balance);
    const amount = runningPeak - balance;
    const percent = runningPeak > 0 ? (amount / runningPeak) * 100 : 0;
    maxPercent = Math.max(maxPercent, percent);
  }

  return maxPercent;
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

function buildFrame(report: ParsedReport, timeframe: StandaloneTimeframe): StandaloneFrame {
  const reportTime = report.metadata.report_timestamp;
  const since = getSinceDate(timeframe, reportTime);
  const deals = timeframe === "all-time" ? report.dealLedger : filterBySince(report.dealLedger, (deal) => deal.time, since);
  const tradingDeals = deals.filter((deal) => isTradingDeal(deal.type));
  const wins = tradingDeals.filter((deal) => dealNet(deal) > 0).length;
  const winPercent = tradingDeals.length ? (wins / tradingDeals.length) * 100 : 0;
  const curve = buildBalanceCurve(deals).map((point) => ({
    x: iso(point.time) ?? "",
    y: point.balance,
  }));
  const netProfit = tradingDeals.reduce((total, deal) => total + dealNet(deal), 0);
  const drawdown = computeBalanceDrawdown(
    deals,
    getLatestDealBalance(deals, report.accountSummary.balance ?? 0),
  );
  const meta = TIMEFRAME_META[timeframe];

  return {
    timeframe,
    label: meta.label,
    context: meta.context,
    overview: {
      netProfit,
      drawdown,
      winPercent,
      trades: tradingDeals.length,
      floatingPL: report.accountSummary.floating_pl ?? 0,
      openCount: report.openPositions.length,
    },
    curve,
  };
}

export function buildStandaloneAccountModel(report: ParsedReport, _fileName: string): StandaloneAccountModel {
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
    reportTimestamp: reportTime.toISOString(),
    balance: getLatestDealBalance(report.dealLedger, report.accountSummary.balance ?? 0),
    equity: report.accountSummary.equity ?? 0,
    floatingProfit: report.accountSummary.floating_pl ?? 0,
    marginLevel: report.accountSummary.margin_level || null,
    frames,
    growth: buildGrowthSeries(report),
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
