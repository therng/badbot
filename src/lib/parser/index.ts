import { createHash } from "node:crypto";

import * as cheerio from "cheerio";

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

  const hasDot = numeric.includes(".");
  const hasComma = numeric.includes(",");

  let canonical = numeric;
  if (hasDot && hasComma) {
    const lastDot = numeric.lastIndexOf(".");
    const lastComma = numeric.lastIndexOf(",");
    if (lastDot > lastComma) {
      canonical = numeric.replace(/,/g, "");
    } else {
      canonical = numeric.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if (hasComma) {
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

function parseIntegerMaybe(value: string): number | null {
  const parsed = parseNumberMaybe(value);
  if (parsed === null) {
    return null;
  }

  const rounded = Math.round(parsed);
  return Number.isFinite(rounded) ? rounded : null;
}

export function parseDate(value: string): Date {
  const text = cleanText(value);
  if (!text) {
    return new Date(Number.NaN);
  }

  const ymdMatch = text.match(
    /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (ymdMatch) {
    const [, year, month, day, hh = "0", mm = "0", ss = "0"] = ymdMatch;
    return new Date(
      Date.UTC(
        Number.parseInt(year, 10),
        Number.parseInt(month, 10) - 1,
        Number.parseInt(day, 10),
        Number.parseInt(hh, 10),
        Number.parseInt(mm, 10),
        Number.parseInt(ss, 10),
      ),
    );
  }

  const dmyMatch = text.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (dmyMatch) {
    const [, day, month, year, hh = "0", mm = "0", ss = "0"] = dmyMatch;
    return new Date(
      Date.UTC(
        Number.parseInt(year, 10),
        Number.parseInt(month, 10) - 1,
        Number.parseInt(day, 10),
        Number.parseInt(hh, 10),
        Number.parseInt(mm, 10),
        Number.parseInt(ss, 10),
      ),
    );
  }

  const nativeParsed = new Date(text);
  if (!Number.isNaN(nativeParsed.getTime())) {
    return nativeParsed;
  }

  return new Date(Number.NaN);
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

  if (/^open positions?(?:\b|\s*\()/i.test(normalized)) {
    return "Open Positions";
  }
  if (/^working orders?(?:\b|\s*\()/i.test(normalized)) {
    return "Working Orders";
  }
  if (/^deals?(?:\b|\s*\()/i.test(normalized)) {
    return "Deals";
  }
  if (/^positions?(?:\b|\s*\()/i.test(normalized)) {
    return "Positions";
  }
  if (/^summary(?:\b|\s*\()/i.test(normalized)) {
    return "Summary";
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
  if (normalized.some((cell) => isValidDate(parseDate(cell)))) {
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

function findFirstValidDate(cells: string[], indexes: number[]): Date | null {
  for (const index of indexes) {
    const parsed = parseDate(getCell(cells, index));
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

  return matches.map((match) => parseDate(match)).filter((date) => isValidDate(date));
}

function parseMetadataFromCells(cells: string[], report: ParsedReport, reportDateCandidates: Date[]): void {
  for (let index = 0; index < cells.length; index += 2) {
    const label = normalizeLabel(cells[index]);
    const value = cleanText(cells[index + 1] ?? "");
    if (!label || !value) {
      continue;
    }

    if (/^(account|account number|account no|account #|login)$/.test(label)) {
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
      continue;
    }

    if (/^(name|owner|owner name)$/.test(label)) {
      report.metadata.owner_name = setMetadataValue(report.metadata.owner_name, value);
      continue;
    }

    if (/^currency$/.test(label)) {
      report.metadata.currency = value;
      continue;
    }

    if (/^server$/.test(label)) {
      report.metadata.server = value;
      continue;
    }

    if (/^company$/.test(label)) {
      report.metadata.company = value;
      continue;
    }

    if (/^(date|to|report time|generated|period)$/.test(label)) {
      reportDateCandidates.push(...extractDateCandidates(value));
    }
  }
}

function summaryFieldFromLabel(label: string): keyof ParsedReport["accountSummary"] | null {
  if (label.startsWith("balance")) {
    return "balance";
  }
  if (label.includes("credit facility")) {
    return "credit_facility";
  }
  if (label.startsWith("equity")) {
    return "equity";
  }
  if (label === "margin") {
    return "margin";
  }
  if (label.includes("free margin")) {
    return "free_margin";
  }
  if (label.includes("margin level")) {
    return "margin_level";
  }
  if (label.includes("floating") && (label.includes("p/l") || label.includes("pl") || label.includes("profit"))) {
    return "floating_pl";
  }

  return null;
}

function parseSummaryRow(cells: string[], report: ParsedReport): void {
  for (let index = 0; index < cells.length - 1; index += 2) {
    const field = summaryFieldFromLabel(normalizeLabel(cells[index]));
    if (!field) {
      continue;
    }

    const value = parseNumberMaybe(cells[index + 1]);
    if (value === null) {
      continue;
    }

    report.accountSummary[field] = value;
  }
}

function isLikelySummaryRow(cells: string[]): boolean {
  let recognizedPairs = 0;

  for (let index = 0; index < cells.length - 1; index += 2) {
    const field = summaryFieldFromLabel(normalizeLabel(cells[index]));
    if (!field) {
      continue;
    }

    const value = parseNumberMaybe(cells[index + 1]);
    if (value === null) {
      continue;
    }

    recognizedPairs += 1;
  }

  return recognizedPairs > 0;
}

function reportResultFieldFromLabel(label: string): keyof NonNullable<ParsedReport["reportResults"]> | null {
  if (/^(total )?commission$/.test(label)) {
    return "total_commission";
  }
  if (/^(total )?swap$/.test(label)) {
    return "total_swap";
  }
  if (label === "total net profit") {
    return "total_net_profit";
  }
  if (label === "gross profit") {
    return "gross_profit";
  }
  if (label === "gross loss") {
    return "gross_loss";
  }
  if (label === "profit factor") {
    return "profit_factor";
  }
  if (label === "expected payoff") {
    return "expected_payoff";
  }
  if (label === "recovery factor") {
    return "recovery_factor";
  }
  if (label === "sharpe ratio") {
    return "sharpe_ratio";
  }
  if (label === "balance drawdown absolute") {
    return "balance_drawdown_absolute";
  }
  if (label === "balance drawdown maximal") {
    return "balance_drawdown_maximal";
  }
  if (label === "balance drawdown relative") {
    return "balance_drawdown_relative_pct";
  }
  if (label === "total trades") {
    return "total_trades";
  }
  if (label.startsWith("profit trades")) {
    return "profit_trades_count";
  }
  if (label.startsWith("loss trades")) {
    return "loss_trades_count";
  }
  if (label === "largest profit trade") {
    return "largest_profit_trade";
  }
  if (label === "largest loss trade") {
    return "largest_loss_trade";
  }
  if (label === "average profit trade") {
    return "average_profit_trade";
  }
  if (label === "average loss trade") {
    return "average_loss_trade";
  }
  if (label.startsWith("maximum consecutive wins")) {
    return "maximum_consecutive_wins";
  }
  if (label.startsWith("maximum consecutive losses")) {
    return "maximum_consecutive_losses";
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
  const numbers = cleanText(value).match(/-?\d+(?:[.,]\d+)?/g) ?? [];
  const parsed = numbers.map((chunk) => parseNumber(chunk)).filter((item) => Number.isFinite(item));
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

function parseDealRow(cells: string[], headerMap: HeaderMap | null): DealLedgerRow | null {
  const time = findFirstValidDate(cells, [findColumnIndex(headerMap, ["time"], "first"), 0]);
  if (!time) {
    return null;
  }

  const dealId = cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["deal", "ticket", "id"], "first"), 1)));
  if (!dealId) {
    return null;
  }

  return {
    dealId,
    time,
    symbol: cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["symbol"], "first"), 2))),
    type:
      cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["type", "side", "direction"], "first"), 3))) ||
      "UNKNOWN",
    direction: cleanText(getCell(cells, findColumnIndex(headerMap, ["direction", "side"], "first"))) || null,
    volume: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["volume"], "first"), 4))),
    price: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["price"], "first"), 5))),
    orderId: cleanText(getCell(cells, findColumnIndex(headerMap, ["order", "order id"], "first"))) || null,
    commission: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["commission"], "first"), 8))),
    fee: parseNumberMaybe(getCell(cells, findColumnIndex(headerMap, ["fee"], "first"))) ?? 0,
    swap: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["swap"], "first"), 9))),
    profit: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["profit", "p/l"], "first"), 10))),
    balanceAfter: parseNumberMaybe(getCell(cells, findColumnIndex(headerMap, ["balance", "balance after"], "first"))),
    comment: cleanText(
      getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["comment"], "first"), cells.length - 1)),
    ),
  };
}

function parseOpenPositionRow(cells: string[], headerMap: HeaderMap | null): OpenPositionRow | null {
  const time = findFirstValidDate(cells, [findColumnIndex(headerMap, ["open time", "time"], "first"), 0]);
  if (!time) {
    return null;
  }

  const positionId = cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["position", "ticket", "id"], "first"), 1)));
  if (!positionId) {
    return null;
  }

  return {
    positionId,
    openedAt: time,
    symbol: cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["symbol"], "first"), 2))) || "UNKNOWN",
    side:
      cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["type", "side", "direction"], "first"), 3))) ||
      "UNKNOWN",
    volume: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["volume"], "first"), 4))),
    openPrice: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["open price", "price"], "first"), 5))),
    sl: parseNumberMaybe(getCell(cells, findColumnIndex(headerMap, ["s/l", "sl"], "first"))),
    tp: parseNumberMaybe(getCell(cells, findColumnIndex(headerMap, ["t/p", "tp"], "first"))),
    marketPrice: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["market price", "price"], "last"), 8))),
    swap: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["swap"], "first"), 9))),
    floatingProfit: parseNumber(
      getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["profit", "floating p/l", "floating pl", "p/l"], "first"), 10)),
    ),
    comment: cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["comment"], "first"), 11))),
  };
}

function parsePositionRow(cells: string[], headerMap: HeaderMap | null): PositionRow | null {
  const openTime = findFirstValidDate(cells, [findColumnIndex(headerMap, ["time", "open time"], "first"), 0]);
  if (!openTime) {
    return null;
  }

  const positionNo = cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["position", "ticket", "id"], "first"), 1)));
  if (!positionNo) {
    return null;
  }

  return {
    positionNo,
    symbol: cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["symbol"], "first"), 2))) || "UNKNOWN",
    type:
      cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["type", "side", "direction"], "first"), 3))) ||
      "UNKNOWN",
    volume: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["volume"], "first"), 4))),
    openTime,
    openPrice: parseNumberMaybe(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["price", "open price"], "first"), 5))),
    sl: parseNumberMaybe(getCell(cells, findColumnIndex(headerMap, ["s/l", "sl"], "first"))),
    tp: parseNumberMaybe(getCell(cells, findColumnIndex(headerMap, ["t/p", "tp"], "first"))),
    closeTime: findFirstValidDate(cells, [findColumnIndex(headerMap, ["time", "close time"], "last"), 8]),
    closePrice: parseNumberMaybe(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["price", "close price"], "last"), 9))),
    commission: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["commission"], "first"), 10))),
    swap: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["swap"], "first"), 11))),
    profit: parseNumber(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["profit", "p/l"], "first"), 12))),
    comment: cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["comment"], "first"), cells.length - 1))) || null,
  };
}

function parseWorkingOrderRow(cells: string[], headerMap: HeaderMap | null): WorkingOrderRow | null {
  const time = findFirstValidDate(cells, [findColumnIndex(headerMap, ["time", "open time"], "first"), 0]);
  if (!time) {
    return null;
  }

  const orderId = cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["order", "ticket", "id"], "first"), 1)));
  if (!orderId) {
    return null;
  }

  return {
    orderId,
    openedAt: time,
    symbol: cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["symbol"], "first"), 2))) || "UNKNOWN",
    type:
      cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["type", "side", "direction"], "first"), 3))) ||
      "UNKNOWN",
    volumeRequested: parseVolume(
      getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["volume"], "first"), 4)),
    ).req,
    volumeFilled: parseVolume(
      getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["volume"], "first"), 4)),
    ).filled,
    price: parseNumberMaybe(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["price"], "first"), 5))),
    sl: parseNumberMaybe(getCell(cells, findColumnIndex(headerMap, ["s/l", "sl"], "first"))),
    tp: parseNumberMaybe(getCell(cells, findColumnIndex(headerMap, ["t/p", "tp"], "first"))),
    marketPrice: parseNumberMaybe(
      getCell(cells, findColumnIndex(headerMap, ["market price", "market", "price"], "last")),
    ),
    state: cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["state", "status"], "first"), 9))) || "Working",
    comment: cleanText(getCell(cells, indexOrFallback(findColumnIndex(headerMap, ["comment"], "first"), 10))),
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
