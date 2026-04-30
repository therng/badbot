import { createHash } from "node:crypto";

import * as cheerio from "cheerio";

import { parseBangkokDate, parseTableDate } from "@/lib/time";

export interface ParsedReport {
  fileHash: string;
  metadata: {
    account_number: string;
    owner_name: string;
    company?: string;
    currency: string;
    server: string;
    report_timestamp: Date;
  };
  dealLedger: DealLedgerRow[];
  positions: PositionRow[];
  openPositions: OpenPositionRow[];
  workingOrders: WorkingOrderRow[];
  accountSummary: {
    balance: number;
    credit_facility: number;
    equity: number;
    margin: number;
    free_margin: number;
    floating_pl: number;
    margin_level: number;
  };
  reportResults?: {
    total_commission?: number;
    total_swap?: number;
    total_net_profit?: number;
    gross_profit?: number;
    gross_loss?: number;
    profit_factor?: number;
    expected_payoff?: number;
    recovery_factor?: number;
    sharpe_ratio?: number;
    balance_drawdown_absolute?: number;
    balance_drawdown_maximal?: number;
    balance_drawdown_maximal_pct?: number;
    balance_drawdown_relative_pct?: number;
    balance_drawdown_relative?: number;
    total_trades?: number;
    short_trades_won?: number;
    short_trades_total?: number;
    long_trades_won?: number;
    long_trades_total?: number;
    profit_trades_count?: number;
    loss_trades_count?: number;
    largest_profit_trade?: number;
    largest_loss_trade?: number;
    average_profit_trade?: number;
    average_loss_trade?: number;
    maximum_consecutive_wins?: number;
    maximum_consecutive_losses?: number;
  };
}

type ReportSection =
  | "Deals"
  | "Positions"
  | "Open Positions"
  | "Working Orders"
  | "Summary"
  | "";

type HeaderMap = Map<string, number[]>;

interface DealLedgerRow {
  dealId: string;
  time: Date;
  symbol: string | null;
  type: string;
  direction: string | null;
  volume: number | null;
  price: number | null;
  orderId: string | null;
  commission: number;
  fee: number;
  swap: number;
  profit: number;
  balanceAfter: number | null;
  comment: string | null;
}

interface OpenPositionRow {
  positionId: string;
  openedAt: Date | null;
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
}

interface PositionRow {
  positionNo: string;
  symbol: string;
  type: string;
  volume: number;
  openTime: Date | null;
  openPrice: number | null;
  sl: number | null;
  tp: number | null;
  closeTime: Date | null;
  closePrice: number | null;
  commission: number;
  swap: number;
  profit: number;
  comment: string | null;
}

interface WorkingOrderRow {
  orderId: string;
  openedAt: Date | null;
  symbol: string;
  type: string;
  volumeRequested: number | null;
  volumeFilled: number | null;
  price: number | null;
  sl: number | null;
  tp: number | null;
  marketPrice: number | null;
  state: string;
  comment: string | null;
}

export function parseNumber(value: string): number {
  const text = cleanText(value);
  if (!text) {
    return 0;
  }

  const normalized = text.replace(/\u00A0/g, "");
  const isNegativeParen = normalized.startsWith("(") && normalized.endsWith(")");
  const sign = isNegativeParen || normalized.includes("-") ? -1 : 1;
  const numeric = normalized.replace(/[()]/g, "").replace(/[^\d.,]/g, "");
  if (!numeric || !/\d/.test(numeric)) {
    return 0;
  }

  let canonical = numeric;
  const lastDot = numeric.lastIndexOf(".");
  const lastComma = numeric.lastIndexOf(",");

  if (lastDot > -1 && lastComma > -1) {
    if (lastDot > lastComma) {
      canonical = numeric.replace(/,/g, "");
    } else {
      canonical = numeric.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if (lastComma > -1) {
    if (/^\d{1,3}(,\d{3})+$/.test(numeric)) {
      canonical = numeric.replace(/,/g, "");
    } else {
      canonical = numeric.replace(/,/g, ".");
    }
  }

  const parsed = Number.parseFloat(canonical);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return sign < 0 ? -Math.abs(parsed) : parsed;
}

function parseNumberMaybe(value: string): number | null {
  if (!/\d/.test(value)) {
    return null;
  }

  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStrictNumberMaybe(value: string): number | null {
  const text = cleanText(value);
  if (!text || /[A-Za-z]/.test(text)) {
    return null;
  }

  return parseNumberMaybe(text);
}

function parseStrictMetricCell(value: string) {
  const text = cleanText(value);
  if (!text) {
    return {
      valid: true,
      value: 0,
    };
  }

  const parsed = parseStrictNumberMaybe(text);
  if (parsed === null) {
    return {
      valid: false,
      value: 0,
    };
  }

  return {
    valid: true,
    value: parsed,
  };
}

function parseIntegerMaybe(value: string): number | null {
  const parsed = parseNumberMaybe(value);
  if (parsed === null) {
    return null;
  }

  const rounded = Math.round(parsed);
  return Number.isFinite(rounded) ? rounded : null;
}

export function parseDate(value: string): Date {
  return parseTableDate(value);
}

export function parseReportDate(value: string): Date {
  return parseBangkokDate(value);
}

export function parseVolume(value: string): { req: number; filled: number } {
  const text = cleanText(value);
  if (!text) {
    return { req: 0, filled: 0 };
  }

  if (text.includes("/")) {
    const [requested, filled] = text.split("/").map((chunk) => parseNumber(chunk));
    return { req: requested, filled };
  }

  const amount = parseNumber(text);
  return { req: amount, filled: amount };
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLabel(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/:/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
}

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function getRowCells($row: any, $: any): string[] {
  const cells: string[] = $row
    .find("th,td")
    .toArray()
    .filter((cell: any) => {
      const className = cleanText($(cell).attr("class"));
      const style = cleanText($(cell).attr("style"));
      return !/\bhidden\b/i.test(className) && !/display\s*:\s*none/i.test(style);
    })
    .map((cell: any) => cleanText($(cell).text()));

  return cells.every((cell) => cell.length === 0) ? [] : cells;
}

function detectSection(text: string): ReportSection {
  const normalized = normalizeLabel(text);
  if (!normalized) {
    return "";
  }

  const sections: [RegExp, ReportSection][] = [
    [/^open positions?(?:\b|\s*\()/i, "Open Positions"],
    [/^working orders?(?:\b|\s*\()/i, "Working Orders"],
    [/^deals?(?:\b|\s*\()/i, "Deals"],
    [/^positions?(?:\b|\s*\()/i, "Positions"],
    [/^summary(?:\b|\s*\()/i, "Summary"],
  ];

  for (const [regex, section] of sections) {
    if (regex.test(normalized)) {
      return section;
    }
  }

  return "";
}

function inferTableSection($table: any, $: any): ReportSection {
  const rowSection = $table
    .find("tr")
    .slice(0, 3)
    .toArray()
    .map((row: any) => detectSection(cleanText($(row).text())))
    .find((section: ReportSection) => section !== "");

  if (rowSection) {
    return rowSection;
  }

  let previous = $table.prev();
  for (let index = 0; index < 6 && previous.length > 0; index += 1) {
    const detected = detectSection(previous.text());
    if (detected) {
      return detected;
    }
    previous = previous.prev();
  }

  return "";
}

function isLikelyHeaderRow(cells: string[]): boolean {
  if (cells.length < 2 || cells.every((cell) => /:$/.test(cell))) {
    return false;
  }

  const knownTokens = [
    "time",
    "open time",
    "close time",
    "ticket",
    "position",
    "order",
    "deal",
    "symbol",
    "type",
    "volume",
    "price",
    "s/l",
    "t/p",
    "state",
    "comment",
    "commission",
    "swap",
    "profit",
    "balance",
  ];

  const normalized = cells.map((cell) => normalizeLabel(cell));
  if (normalized.some((cell) => isValidDate(parseTableDate(cell)) || isValidDate(parseBangkokDate(cell)))) {
    return false;
  }

  const matches = normalized.filter((cell) =>
    knownTokens.some((token) => cell === token || cell.includes(token)),
  ).length;

  return matches >= 2;
}

function buildHeaderMap(cells: string[]): HeaderMap {
  const headerMap: HeaderMap = new Map();

  cells.forEach((cell, index) => {
    const key = normalizeLabel(cell);
    if (!key) {
      return;
    }

    const indices = headerMap.get(key) ?? [];
    indices.push(index);
    headerMap.set(key, indices);
  });

  return headerMap;
}

function findColumnIndex(headerMap: HeaderMap | null, keys: string[], occurrence: "first" | "last" = "first") {
  if (!headerMap) {
    return -1;
  }

  for (const key of keys) {
    const indices = headerMap.get(normalizeLabel(key));
    if (!indices?.length) {
      continue;
    }

    return occurrence === "first" ? indices[0] : indices[indices.length - 1];
  }

  return -1;
}

function indexOrFallback(index: number, fallback: number): number {
  return index >= 0 ? index : fallback;
}

function getCell(cells: string[], index: number): string {
  return index >= 0 && index < cells.length ? cleanText(cells[index]) : "";
}

function getOptionalCommentCell(cells: string[], headerMap: HeaderMap | null): string | null {
  const commentIndex = findColumnIndex(headerMap, ["comment"], "first");
  if (commentIndex < 0) {
    return null;
  }

  return cleanText(getCell(cells, commentIndex)) || null;
}

function findFirstValidDate(cells: string[], indexes: number[]): Date | null {
  for (const index of indexes) {
    const parsed = parseTableDate(getCell(cells, index));
    if (isValidDate(parsed)) {
      return parsed;
    }
  }

  return null;
}

function setMetadataValue(currentValue: string, nextValue: string): string {
  return currentValue || nextValue;
}

function extractDateCandidates(text: string): Date[] {
  const matches =
    text.match(/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/g) ?? [];

  return matches.map((match) => parseReportDate(match)).filter((date) => isValidDate(date));
}

function parseMetadataFromCells(cells: string[], report: ParsedReport, reportDateCandidates: Date[]): void {
  for (let index = 0; index < cells.length; index += 2) {
    const label = normalizeLabel(cells[index]);
    const value = cleanText(cells[index + 1] ?? "");
    if (!label || !value) {
      continue;
    }

    switch (true) {
      case /^(account|account number|account no|account #|login)$/.test(label): {
        const accountMatch = value.match(/\d{4,}/);
        if (accountMatch) {
          report.metadata.account_number = setMetadataValue(report.metadata.account_number, accountMatch[0]);
        }

        const detailMatch = value.match(/\(([^)]+)\)/);
        if (detailMatch) {
          const [currency = "", server = ""] = detailMatch[1]
            .split(",")
            .map((part) => cleanText(part));

          if (currency) {
            report.metadata.currency = currency;
          }

          if (server) {
            report.metadata.server = server;
          }
        }
        break;
      }
      case /^(name|owner|owner name)$/.test(label):
        report.metadata.owner_name = setMetadataValue(report.metadata.owner_name, value);
        break;
      case label === "currency":
        report.metadata.currency = value;
        break;
      case label === "server":
        report.metadata.server = value;
        break;
      case label === "company":
        report.metadata.company = value;
        break;
      case /^(date|to|report time|generated|period)$/.test(label):
        reportDateCandidates.push(...extractDateCandidates(value));
        break;
    }
  }
}

function summaryFieldFromLabel(label: string): keyof ParsedReport["accountSummary"] | null {
  const fields: Record<string, keyof ParsedReport["accountSummary"]> = {
    "balance": "balance",
    "credit facility": "credit_facility",
    "equity": "equity",
    "margin": "margin",
    "free margin": "free_margin",
    "margin level": "margin_level",
    "floating p/l": "floating_pl",
    "floating pl": "floating_pl",
    "floating profit": "floating_pl",
  };

  return fields[label] ?? null;
}

function findSummaryValueAfterLabel(cells: string[], labelIndex: number): number | null {
  for (let index = labelIndex + 1; index < cells.length; index += 1) {
    if (summaryFieldFromLabel(normalizeLabel(cells[index]))) {
      return null;
    }

    const value = parseNumberMaybe(cells[index]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function parseSummaryRow(cells: string[], report: ParsedReport): void {
  for (let index = 0; index < cells.length - 1; index += 1) {
    const field = summaryFieldFromLabel(normalizeLabel(cells[index]));
    if (!field) {
      continue;
    }

    const value = findSummaryValueAfterLabel(cells, index);
    if (value === null) {
      continue;
    }

    report.accountSummary[field] = value;
  }
}

function isLikelySummaryRow(cells: string[]): boolean {
  let recognizedPairs = 0;

  for (let index = 0; index < cells.length - 1; index += 1) {
    const field = summaryFieldFromLabel(normalizeLabel(cells[index]));
    if (!field) {
      continue;
    }

    const value = findSummaryValueAfterLabel(cells, index);
    if (value === null) {
      continue;
    }

    recognizedPairs += 1;
  }

  return recognizedPairs > 0;
}

function reportResultFieldFromLabel(label: string): keyof NonNullable<ParsedReport["reportResults"]> | null {
  const exactMatches: Record<string, keyof NonNullable<ParsedReport["reportResults"]>> = {
    "total net profit": "total_net_profit",
    "gross profit": "gross_profit",
    "gross loss": "gross_loss",
    "profit factor": "profit_factor",
    "expected payoff": "expected_payoff",
    "recovery factor": "recovery_factor",
    "sharpe ratio": "sharpe_ratio",
    "balance drawdown absolute": "balance_drawdown_absolute",
    "balance drawdown maximal": "balance_drawdown_maximal",
    "balance drawdown relative": "balance_drawdown_relative_pct",
    "total trades": "total_trades",
    "largest profit trade": "largest_profit_trade",
    "largest loss trade": "largest_loss_trade",
    "average profit trade": "average_profit_trade",
    "average loss trade": "average_loss_trade",
  };

  if (exactMatches[label]) {
    return exactMatches[label];
  }

  const regexMatches: [RegExp, keyof NonNullable<ParsedReport["reportResults"]>][] = [
    [/^(total )?commission$/, "total_commission"],
    [/^(total )?swap$/, "total_swap"],
    [/^profit trades/, "profit_trades_count"],
    [/^loss trades/, "loss_trades_count"],
    [/^maximum consecutive wins/, "maximum_consecutive_wins"],
    [/^maximum consecutive losses/, "maximum_consecutive_losses"],
  ];

  for (const [regex, field] of regexMatches) {
    if (regex.test(label)) {
      return field;
    }
  }

  return null;
}

function setReportResultField(
  report: ParsedReport,
  field: keyof NonNullable<ParsedReport["reportResults"]>,
  value: number | null,
): void {
  if (value === null || !Number.isFinite(value)) {
    return;
  }

  report.reportResults ??= {};
  report.reportResults[field] = value;
}

function parseCountPercentValue(value: string): { count: number | null; percent: number | null } {
  const text = cleanText(value);
  if (!text) {
    return { count: null, percent: null };
  }

  const countMatch = text.match(/^-?\d+/);
  const percentMatch = text.match(/(-?\d+(?:[.,]\d+)?)\s*%/);

  return {
    count: countMatch ? Number.parseInt(countMatch[0], 10) : null,
    percent: percentMatch ? parseNumber(percentMatch[1]) : null,
  };
}

function parseDrawdownValue(value: string): { primary: number | null; secondary: number | null } {
  const text = cleanText(value);
  if (!text) {
    return {
      primary: null,
      secondary: null,
    };
  }

  const parentheticalSegments = Array.from(text.matchAll(/\(([^()]+)\)/g))
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
  const outsideSegment = cleanText(text.replace(/\([^()]+\)/g, ""));
  const parseSegment = (segment: string) => parseStrictNumberMaybe(segment.replace(/%/g, ""));
  const outsideValue = outsideSegment ? parseSegment(outsideSegment) : null;
  const insideValue = parentheticalSegments.length ? parseSegment(parentheticalSegments[0]) : null;

  const parsed = [outsideValue, insideValue].filter((item): item is number => Number.isFinite(item));
  return {
    primary: parsed[0] ?? null,
    secondary: parsed[1] ?? null,
  };
}

function parseReportResultPair(report: ParsedReport, rawLabel: string, rawValue: string): void {
  const label = normalizeLabel(rawLabel);
  const value = cleanText(rawValue);
  if (!label || !value) {
    return;
  }

  if (label.startsWith("short trades")) {
    const { count, percent } = parseCountPercentValue(value);
    setReportResultField(report, "short_trades_total", count);
    if (count !== null && percent !== null) {
      setReportResultField(report, "short_trades_won", Math.round((count * percent) / 100));
    }
    return;
  }

  if (label.startsWith("long trades")) {
    const { count, percent } = parseCountPercentValue(value);
    setReportResultField(report, "long_trades_total", count);
    if (count !== null && percent !== null) {
      setReportResultField(report, "long_trades_won", Math.round((count * percent) / 100));
    }
    return;
  }

  if (label === "balance drawdown maximal") {
    const { primary, secondary } = parseDrawdownValue(value);
    setReportResultField(report, "balance_drawdown_maximal", primary);
    setReportResultField(report, "balance_drawdown_maximal_pct", secondary);
    return;
  }

  if (label === "balance drawdown relative") {
    const { primary, secondary } = parseDrawdownValue(value);
    setReportResultField(report, "balance_drawdown_relative_pct", primary);
    setReportResultField(report, "balance_drawdown_relative", secondary);
    return;
  }

  const field = reportResultFieldFromLabel(label);
  if (!field) {
    return;
  }

  const numericValue = field === "total_trades" || field.endsWith("_count") || field.startsWith("maximum_consecutive")
    ? parseIntegerMaybe(value)
    : parseNumberMaybe(value);
  setReportResultField(report, field, numericValue);
}

function parseReportResultsFromText($: any, report: ParsedReport): void {
  $("tr").each((_: number, row: any) => {
    const cells = getRowCells($(row), $);
    if (cells.length < 2) {
      return;
    }

    for (let index = 0; index < cells.length - 1; index += 2) {
      parseReportResultPair(report, cells[index], cells[index + 1]);
    }
  });
}

function getMappedCell(
  cells: string[],
  headerMap: HeaderMap | null,
  keys: string[],
  fallbackIndex: number,
  occurrence: "first" | "last" = "first",
): string {
  const index = findColumnIndex(headerMap, keys, occurrence);
  return getCell(cells, index >= 0 ? index : fallbackIndex);
}

function getMappedNumber(
  cells: string[],
  headerMap: HeaderMap | null,
  keys: string[],
  fallbackIndex: number,
  occurrence: "first" | "last" = "first",
): number {
  return parseNumber(getMappedCell(cells, headerMap, keys, fallbackIndex, occurrence));
}

function getMappedNumberMaybe(
  cells: string[],
  headerMap: HeaderMap | null,
  keys: string[],
  fallbackIndex: number = -1,
  occurrence: "first" | "last" = "first",
): number | null {
  const index = findColumnIndex(headerMap, keys, occurrence);
  const finalIndex = index >= 0 ? index : fallbackIndex;
  return finalIndex >= 0 ? parseNumberMaybe(getCell(cells, finalIndex)) : null;
}

function parseDealRow(cells: string[], headerMap: HeaderMap | null): DealLedgerRow | null {
  const time = findFirstValidDate(cells, [findColumnIndex(headerMap, ["time"], "first"), 0]);
  if (!time) {
    return null;
  }

  const dealId = getMappedCell(cells, headerMap, ["deal", "ticket", "id"], 1);
  if (!dealId) {
    return null;
  }

  return {
    dealId,
    time,
    symbol: getMappedCell(cells, headerMap, ["symbol"], 2),
    type: getMappedCell(cells, headerMap, ["type", "side", "direction"], 3) || "UNKNOWN",
    direction: getMappedCell(cells, headerMap, ["direction", "side"], -1) || null,
    volume: getMappedNumber(cells, headerMap, ["volume"], 4),
    price: getMappedNumber(cells, headerMap, ["price"], 5),
    orderId: getMappedCell(cells, headerMap, ["order", "order id"], -1) || null,
    commission: getMappedNumber(cells, headerMap, ["commission"], 8),
    fee: getMappedNumberMaybe(cells, headerMap, ["fee"]) ?? 0,
    swap: getMappedNumber(cells, headerMap, ["swap"], 9),
    profit: getMappedNumber(cells, headerMap, ["profit", "p/l"], 10),
    balanceAfter: getMappedNumberMaybe(cells, headerMap, ["balance", "balance after"]),
    comment: getOptionalCommentCell(cells, headerMap),
  };
}

function parseOpenPositionRow(cells: string[], headerMap: HeaderMap | null): OpenPositionRow | null {
  const time = findFirstValidDate(cells, [findColumnIndex(headerMap, ["open time", "time"], "first"), 0]);
  if (!time) {
    return null;
  }

  const positionId = getMappedCell(cells, headerMap, ["position", "ticket", "id"], 1);
  if (!positionId) {
    return null;
  }

  return {
    positionId,
    openedAt: time,
    symbol: getMappedCell(cells, headerMap, ["symbol"], 2) || "UNKNOWN",
    side: getMappedCell(cells, headerMap, ["type", "side", "direction"], 3) || "UNKNOWN",
    volume: getMappedNumber(cells, headerMap, ["volume"], 4),
    openPrice: getMappedNumber(cells, headerMap, ["open price", "price"], 5),
    sl: getMappedNumberMaybe(cells, headerMap, ["s/l", "sl"]),
    tp: getMappedNumberMaybe(cells, headerMap, ["t/p", "tp"]),
    marketPrice: getMappedNumber(cells, headerMap, ["market price", "price"], 8, "last"),
    swap: getMappedNumber(cells, headerMap, ["swap"], 9),
    floatingProfit: getMappedNumber(cells, headerMap, ["profit", "floating p/l", "floating pl", "p/l"], 10),
    comment: getOptionalCommentCell(cells, headerMap),
  };
}

function parsePositionRow(cells: string[], headerMap: HeaderMap | null): PositionRow | null {
  if (!headerMap) {
    return null;
  }

  const openTime = findFirstValidDate(cells, [findColumnIndex(headerMap, ["time", "open time"], "first"), 0]);
  if (!openTime) {
    return null;
  }

  const positionNo = getMappedCell(cells, headerMap, ["position", "ticket", "id"], 1);
  if (!positionNo) {
    return null;
  }

  const openPrice = parseStrictNumberMaybe(getMappedCell(cells, headerMap, ["price", "open price"], 5));
  const closeTime = findFirstValidDate(cells, [findColumnIndex(headerMap, ["time", "close time"], "last"), 8]);
  const closePrice = parseStrictNumberMaybe(getMappedCell(cells, headerMap, ["price", "close price"], 9, "last"));

  // Closed-position rows with missing/zero prices are parser noise in current MT5 reports and
  // end up turning comment text into fake commission/swap values via fallback indexes.
  if (!closeTime || !Number.isFinite(openPrice ?? Number.NaN) || !Number.isFinite(closePrice ?? Number.NaN)) {
    return null;
  }

  if ((openPrice ?? 0) <= 0 || (closePrice ?? 0) <= 0) {
    return null;
  }

  const commissionIndex = findColumnIndex(headerMap, ["commission"], "first");
  const swapIndex = findColumnIndex(headerMap, ["swap"], "first");
  const profitIndex = findColumnIndex(headerMap, ["profit", "p/l"], "first");

  if (commissionIndex < 0 || swapIndex < 0 || profitIndex < 0) {
    return null;
  }

  const commission = parseStrictMetricCell(getCell(cells, commissionIndex));
  const swap = parseStrictMetricCell(getCell(cells, swapIndex));
  const profit = parseStrictMetricCell(getCell(cells, profitIndex));

  if (!commission.valid || !swap.valid || !profit.valid) {
    return null;
  }

  return {
    positionNo,
    symbol: getMappedCell(cells, headerMap, ["symbol"], 2) || "UNKNOWN",
    type: getMappedCell(cells, headerMap, ["type", "side", "direction"], 3) || "UNKNOWN",
    volume: getMappedNumber(cells, headerMap, ["volume"], 4),
    openTime,
    openPrice,
    sl: getMappedNumberMaybe(cells, headerMap, ["s/l", "sl"]),
    tp: getMappedNumberMaybe(cells, headerMap, ["t/p", "tp"]),
    closeTime,
    closePrice,
    commission: commission.value,
    swap: swap.value,
    profit: profit.value,
    comment: getOptionalCommentCell(cells, headerMap),
  };
}

function parseWorkingOrderRow(cells: string[], headerMap: HeaderMap | null): WorkingOrderRow | null {
  const time = findFirstValidDate(cells, [findColumnIndex(headerMap, ["time", "open time"], "first"), 0]);
  if (!time) {
    return null;
  }

  const orderId = getMappedCell(cells, headerMap, ["order", "ticket", "id"], 1);
  if (!orderId) {
    return null;
  }

  const vol = parseVolume(getMappedCell(cells, headerMap, ["volume"], 4));

  return {
    orderId,
    openedAt: time,
    symbol: getMappedCell(cells, headerMap, ["symbol"], 2) || "UNKNOWN",
    type: getMappedCell(cells, headerMap, ["type", "side", "direction"], 3) || "UNKNOWN",
    volumeRequested: vol.req,
    volumeFilled: vol.filled,
    price: getMappedNumberMaybe(cells, headerMap, ["price"], 5),
    sl: getMappedNumberMaybe(cells, headerMap, ["s/l", "sl"]),
    tp: getMappedNumberMaybe(cells, headerMap, ["t/p", "tp"]),
    marketPrice: getMappedNumberMaybe(cells, headerMap, ["market price", "market", "price"], -1, "last"),
    state: getMappedCell(cells, headerMap, ["state", "status"], 9) || "Working",
    comment: getOptionalCommentCell(cells, headerMap),
  };
}

function parseTableRows($table: any, $: any, report: ParsedReport, reportDateCandidates: Date[]): void {
  let currentSection = inferTableSection($table, $);
  let headerMap: HeaderMap | null = null;

  $table.find("tr").each((_: number, row: any) => {
    const cells = getRowCells($(row), $);
    if (cells.length === 0) {
      return;
    }

    const sectionLabel = cells.length <= 2 ? detectSection(cells.join(" ")) : "";
    if (sectionLabel) {
      currentSection = sectionLabel;
      headerMap = null;
      return;
    }

    parseMetadataFromCells(cells, report, reportDateCandidates);
    if (currentSection === "Summary" || (currentSection === "" && isLikelySummaryRow(cells))) {
      parseSummaryRow(cells, report);
    }

    if (isLikelyHeaderRow(cells)) {
      headerMap = buildHeaderMap(cells);
      return;
    }

    if (!currentSection) {
      return;
    }

    if (currentSection === "Deals") {
      const parsed = parseDealRow(cells, headerMap);
      if (parsed) {
        report.dealLedger.push(parsed);
      } else {
        for (let index = 0; index < cells.length - 1; index += 2) {
          parseReportResultPair(report, cells[index], cells[index + 1]);
        }
      }
      return;
    }

    if (currentSection === "Positions") {
      const parsed = parsePositionRow(cells, headerMap);
      if (parsed) {
        report.positions.push(parsed);
      }
      return;
    }

    if (currentSection === "Open Positions") {
      const parsed = parseOpenPositionRow(cells, headerMap);
      if (parsed) {
        report.openPositions.push(parsed);
      }
      return;
    }

    if (currentSection === "Working Orders") {
      const parsed = parseWorkingOrderRow(cells, headerMap);
      if (parsed) {
        report.workingOrders.push(parsed);
      }
    }
  });
}

function inferReportTimestamp(report: ParsedReport, reportDateCandidates: Date[]): Date {
  const validReportDates = reportDateCandidates.filter((date) => isValidDate(date));
  if (validReportDates.length) {
    return validReportDates.reduce((latest, current) =>
      current.getTime() > latest.getTime() ? current : latest,
    );
  }

  const recordDates = report.dealLedger.map((deal) => deal.time).filter((date) => isValidDate(date));

  if (recordDates.length) {
    return recordDates.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest));
  }

  return new Date();
}

export function parseReport(htmlContent: string): ParsedReport {
  const $ = cheerio.load(htmlContent);
  const fileHash = createHash("sha256").update(htmlContent).digest("hex");

  const report: ParsedReport = {
    fileHash,
    metadata: {
      account_number: "",
      owner_name: "",
      currency: "USD",
      server: "",
      report_timestamp: new Date(),
    },
    dealLedger: [],
    positions: [],
    openPositions: [],
    workingOrders: [],
    accountSummary: {
      balance: 0,
      credit_facility: 0,
      equity: 0,
      margin: 0,
      free_margin: 0,
      floating_pl: 0,
      margin_level: 0,
    },
  };

  const title = $("title").text() || $("h1").first().text();
  const compactTitle = cleanText(title);

  const accountMatch =
    compactTitle.match(/(?:^|\s)(\d{5,})(?:\s|:|$)/) ??
    compactTitle.match(/reporthistory[-_]?(\d{5,})/i);
  if (accountMatch) {
    report.metadata.account_number = accountMatch[1];
  }

  const ownerMatch = compactTitle.match(/^\d{5,}\s*:\s*(.+?)(?:\s+-\s+|$)/);
  if (ownerMatch) {
    report.metadata.owner_name = cleanText(ownerMatch[1]);
  }

  const reportDateCandidates = extractDateCandidates(compactTitle);

  $("tr").each((_: number, row: any) => {
    const cells = getRowCells($(row), $);
    if (!cells.length) {
      return;
    }

    parseMetadataFromCells(cells, report, reportDateCandidates);
    if (isLikelySummaryRow(cells)) {
      parseSummaryRow(cells, report);
    }
  });

  $("table").each((_: number, table: any) => {
    parseTableRows($(table), $, report, reportDateCandidates);
  });

  parseReportResultsFromText($, report);

  report.metadata.report_timestamp = inferReportTimestamp(report, reportDateCandidates);

  if (report.accountSummary.floating_pl === 0 && report.openPositions.length) {
    report.accountSummary.floating_pl = report.openPositions.reduce(
      (sum, position) => sum + position.floatingProfit,
      0,
    );
  }

  report.dealLedger.sort((left, right) => left.time.getTime() - right.time.getTime());

  report.metadata.account_number = cleanText(report.metadata.account_number);
  report.metadata.owner_name = cleanText(report.metadata.owner_name);
  report.metadata.company = cleanText(report.metadata.company);
  report.metadata.currency = cleanText(report.metadata.currency) || "USD";
  report.metadata.server = cleanText(report.metadata.server);

  return report;
}
