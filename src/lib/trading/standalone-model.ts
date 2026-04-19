import type { ParsedReport } from "@/lib/parser";
import { computeBalanceDrawdown as computeSharedBalanceDrawdown, summarizeClosedPositions } from "@/lib/trading/analytics";

export type StandaloneTimeframe = "day" | "week" | "month" | "year" | "all-time";

export interface StandaloneFrame {
  timeframe: StandaloneTimeframe;
  label: string;
  context: string;
  overview: {
    netProfit: number;
    drawdown: number;
    winPercent: number | null;
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

function normalizeDealComment(comment: string | null | undefined) {
  return typeof comment === "string" ? comment.replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function dealNet(row: { profit?: number | null; commission?: number | null; swap?: number | null }) {
  return Number(row.profit ?? 0) + Number(row.commission ?? 0) + Number(row.swap ?? 0);
}

function isFundingDeal(type: string | null | undefined, comment: string | null | undefined = null, delta: number | null = null) {
  const normalized = normalizeDealType(type);
  const normalizedComment = normalizeDealComment(comment);
  const searchText = [normalized, normalizedComment].filter(Boolean).join(" ");

  if (!normalized && !normalizedComment) {
    return false;
  }

  if (searchText.includes("deposit") || searchText.includes("withdraw")) {
    return true;
  }

  if (
    searchText.includes("balance adjustment")
    || (normalized === "balance" && normalizedComment.includes("adjustment"))
  ) {
    return true;
  }

  if (GENERIC_BALANCE_OPERATION_KEYWORDS.some((token) => searchText.includes(token))) {
    return true;
  }

  if (normalized === "balance") {
    return delta !== 0 || normalizedComment.length > 0;
  }

  return false;
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

function resolveGrowthBalanceAfter(
  deal: DealRow,
  previousBalance: number | null,
) {
  const balanceAfter = Number(deal.balanceAfter ?? Number.NaN);
  if (Number.isFinite(balanceAfter)) {
    return balanceAfter;
  }

  if (previousBalance === null || !Number.isFinite(previousBalance)) {
    return null;
  }

  const nextBalance = previousBalance + dealNet(deal);
  return Number.isFinite(nextBalance) ? nextBalance : null;
}

function resolveInitialGrowthBalance(sortedDeals: DealRow[]) {
  if (!sortedDeals.length) {
    return 0;
  }

  let runningBalance = deriveStartingBalanceFromDeal(sortedDeals[0]);
  if (!Number.isFinite(runningBalance)) {
    runningBalance = 0;
  }

  for (const deal of sortedDeals) {
    const balanceAfter = resolveGrowthBalanceAfter(deal, runningBalance);
    if (balanceAfter !== null) {
      runningBalance = balanceAfter;
    }

    if (isFundingDeal(deal.type, deal.comment, dealNet(deal)) && Number.isFinite(runningBalance) && runningBalance !== 0) {
      return runningBalance;
    }
  }

  const startingBalance = deriveStartingBalanceFromDeal(sortedDeals[0]);
  if (Number.isFinite(startingBalance) && startingBalance > 0) {
    return startingBalance;
  }

  const firstKnownBalance = resolveGrowthBalanceAfter(sortedDeals[0], null);
  return Number.isFinite(firstKnownBalance) ? Math.max(0, Number(firstKnownBalance)) : 0;
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

function getAccountStatus(reportTimestamp: Date, activeWindowMinutes = 24 * 60) {
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
  let runningBalance = startTimestamp === null ? resolveInitialGrowthBalance(sorted) : deriveStartingBalanceFromDeal(sorted[0]);
  if (!Number.isFinite(runningBalance)) {
    runningBalance = 0;
  }
  let startBalance = runningBalance;
  const window: DealRow[] = [];

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

  return { window, startBalance, endBalance: Number.isFinite(runningBalance) ? runningBalance : startBalance };
}

function computeCompoundedGrowth(deals: DealRow[], start: Date | null, end: Date | null = null) {
  const { window, startBalance } = collectDealWindow(deals, start, end);
  if (!window.length || !Number.isFinite(startBalance)) {
    return 0;
  }

  let growthFactor = 1;
  let currentSegmentOpeningBalance = startBalance;
  let previousBalance = startBalance;
  let hasBalanceOperation = false;
  let invalidSegmentCount = 0;

  for (const deal of window) {
    const balanceAfter = resolveGrowthBalanceAfter(deal, previousBalance);

    if (isFundingDeal(deal.type, deal.comment, dealNet(deal))) {
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
      growthFactor *= previousBalance / currentSegmentOpeningBalance;
    } else if (Number.isFinite(previousBalance) && previousBalance !== currentSegmentOpeningBalance) {
      invalidSegmentCount += 1;
    }
  } else if (startBalance > 0) {
    growthFactor = previousBalance / startBalance;
  } else {
    invalidSegmentCount += 1;
  }

  if (invalidSegmentCount > 0) {
    console.warn("Skipped invalid standalone growth segment(s) with zero opening balance.", {
      end: end?.toISOString() ?? null,
      invalidSegmentCount,
      start: start?.toISOString() ?? null,
    });
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
  const positions = timeframe === "all-time"
    ? report.positions
    : report.positions.filter((position) => {
      if (!position.closeTime || !since) {
        return false;
      }

      return position.closeTime.getTime() >= since.getTime();
    });
  const positionSummary = summarizeClosedPositions(positions);
  const tradingDeals = deals.filter((deal) => isTradingDeal(deal.type));
  const curve = buildBalanceCurve(deals).map((point) => ({
    x: iso(point.time) ?? "",
    y: point.balance,
  }));
  const netProfit = tradingDeals.reduce((total, deal) => total + dealNet(deal), 0);
  const drawdown = computeSharedBalanceDrawdown(deals, since, null).relativePercent;
  const meta = TIMEFRAME_META[timeframe];

  return {
    timeframe,
    label: meta.label,
    context: meta.context,
    overview: {
      netProfit,
      drawdown,
      winPercent: positionSummary.winPercent,
      trades: positionSummary.totalTrades,
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
