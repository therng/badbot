import * as crypto from 'crypto';
import * as cheerio from 'cheerio';

export interface ParsedReport {
  fileHash: string;
  metadata: {
    account_number: string;
    owner_name: string;
    currency: string;
    server: string;
    account_mode: string;
    position_mode: string;
    report_timestamp: Date;
  };
  closedPositions: ClosedPositionRow[];
  orderHistory: OrderHistoryRow[];
  dealLedger: DealLedgerRow[];
  openPositions: OpenPositionRow[];
  workingOrders: WorkingOrderRow[];
  accountSummary: {
    balance: number;
    equity: number;
    margin: number;
    free_margin: number;
    floating_pl: number;
    margin_level: number;
  };
}

type ReportSection =
  | 'Positions'
  | 'Orders'
  | 'Deals'
  | 'Open Positions'
  | 'Working Orders'
  | 'Summary'
  | '';

type HeaderMap = Map<string, number[]>;

interface ClosedPositionRow {
  position_id: string;
  symbol: string;
  side: string;
  volume: number;
  open_price: number;
  close_price: number;
  profit: number;
  swap: number;
  commission: number;
  opened_at: Date;
  closed_at: Date;
  comment: string;
}

interface OrderHistoryRow {
  order_id: string;
  symbol: string;
  type: string;
  volume_requested: number;
  volume_filled: number;
  price: number;
  sl: number;
  tp: number;
  state: string;
  comment: string;
}

interface DealLedgerRow {
  deal_id: string;
  time: Date;
  symbol: string;
  type: string;
  volume: number;
  price: number;
  commission: number;
  swap: number;
  profit: number;
  balance_after: number;
  comment: string;
}

interface OpenPositionRow {
  position_id: string;
  symbol: string;
  side: string;
  volume: number;
  open_price: number;
  market_price: number;
  floating_profit: number;
  swap: number;
  comment: string;
}

interface WorkingOrderRow {
  order_id: string;
  symbol: string;
  type: string;
  volume: number;
  price: number;
  state: string;
  comment: string;
}

export function parseNumber(val: string): number {
  const text = cleanText(val);
  if (!text) return 0;

  const normalized = text.replace(/\u00A0/g, '');
  const isNegativeParen = normalized.startsWith('(') && normalized.endsWith(')');
  const stripped = normalized
    .replace(/[()]/g, '')
    .replace(/[^\d.,+-]/g, '')
    .replace(/,/g, '');

  if (!stripped || stripped === '+' || stripped === '-') return 0;

  let parsed = Number.parseFloat(stripped);
  if (!Number.isFinite(parsed)) {
    const decimalComma = normalized
      .replace(/[()]/g, '')
      .replace(/[^\d,+-]/g, '')
      .replace(/,/g, '.');
    parsed = Number.parseFloat(decimalComma);
  }

  if (!Number.isFinite(parsed)) return 0;
  return isNegativeParen ? -Math.abs(parsed) : parsed;
}

export function parseDate(val: string): Date {
  const text = cleanText(val);
  if (!text) return new Date(Number.NaN);

  const ymdMatch = text.match(
    /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (ymdMatch) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = ymdMatch;
    return new Date(
      Date.UTC(
        Number.parseInt(y, 10),
        Number.parseInt(m, 10) - 1,
        Number.parseInt(d, 10),
        Number.parseInt(hh, 10),
        Number.parseInt(mm, 10),
        Number.parseInt(ss, 10)
      )
    );
  }

  const dmyMatch = text.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (dmyMatch) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = dmyMatch;
    return new Date(
      Date.UTC(
        Number.parseInt(y, 10),
        Number.parseInt(m, 10) - 1,
        Number.parseInt(d, 10),
        Number.parseInt(hh, 10),
        Number.parseInt(mm, 10),
        Number.parseInt(ss, 10)
      )
    );
  }

  const nativeParsed = new Date(text);
  if (!Number.isNaN(nativeParsed.getTime())) {
    return nativeParsed;
  }

  return new Date(Number.NaN);
}

export function parseVolume(val: string): { req: number; filled: number } {
  const text = cleanText(val);
  if (!text) return { req: 0, filled: 0 };

  if (text.includes('/')) {
    const [req, filled] = text.split('/').map((chunk) => parseNumber(chunk));
    return { req, filled };
  }

  const amount = parseNumber(text);
  return { req: amount, filled: amount };
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeLabel(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[:]/g, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ');
}

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function getRowCells($row: cheerio.Cheerio, $: cheerio.Root): string[] {
  return $row
    .find('th,td')
    .toArray()
    .map((cell: cheerio.Element) => cleanText($(cell).text()))
    .filter((cell) => cell.length > 0);
}

function detectSection(text: string): ReportSection {
  const normalized = normalizeLabel(text);
  if (!normalized) return '';

  if (/^open positions?(?:\b|\s*\()/i.test(normalized)) return 'Open Positions';
  if (/^working orders?(?:\b|\s*\()/i.test(normalized)) return 'Working Orders';
  if (/^deals?(?:\b|\s*\()/i.test(normalized)) return 'Deals';
  if (/^orders?(?:\b|\s*\()/i.test(normalized) && !/^working\b/i.test(normalized)) return 'Orders';
  if (/^positions?(?:\b|\s*\()/i.test(normalized) && !/^open\b/i.test(normalized)) return 'Positions';
  if (/^summary(?:\b|\s*\()/i.test(normalized)) return 'Summary';

  return '';
}

function inferTableSection(
  $table: cheerio.Cheerio,
  $: cheerio.Root
): ReportSection {
  const rowSection = $table
    .find('tr')
    .slice(0, 3)
    .toArray()
    .map((row: cheerio.Element) => detectSection(cleanText($(row).text())))
    .find((section: ReportSection) => section !== '');

  if (rowSection) return rowSection;

  let previous = $table.prev();
  for (let i = 0; i < 6 && previous.length > 0; i += 1) {
    const detected = detectSection(previous.text());
    if (detected) return detected;
    previous = previous.prev();
  }

  return '';
}

function isLikelyHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  if (cells.every((cell) => /:$/.test(cell))) return false;

  const knownTokens = [
    'time',
    'open time',
    'close time',
    'ticket',
    'position',
    'order',
    'deal',
    'symbol',
    'type',
    'volume',
    'price',
    's/l',
    't/p',
    'state',
    'comment',
    'commission',
    'swap',
    'profit',
    'balance'
  ];

  const normalized = cells.map((cell) => normalizeLabel(cell));
  const hasDate = normalized.some((cell) => isValidDate(parseDate(cell)));
  if (hasDate) return false;

  const matches = normalized.filter((cell) =>
    knownTokens.some((token) => cell === token || cell.includes(token))
  ).length;

  return matches >= 2;
}

function buildHeaderMap(cells: string[]): HeaderMap {
  const headerMap: HeaderMap = new Map();

  cells.forEach((cell, index) => {
    const key = normalizeLabel(cell);
    if (!key) return;

    const indices = headerMap.get(key) ?? [];
    indices.push(index);
    headerMap.set(key, indices);
  });

  return headerMap;
}

function findColumnIndex(
  headerMap: HeaderMap | null,
  keys: string[],
  occurrence: 'first' | 'last' = 'first'
): number {
  if (!headerMap) return -1;

  for (const key of keys) {
    const normalized = normalizeLabel(key);
    const indices = headerMap.get(normalized);
    if (!indices || indices.length === 0) continue;

    return occurrence === 'first' ? indices[0] : indices[indices.length - 1];
  }

  return -1;
}

function getCell(cells: string[], index: number): string {
  if (index < 0 || index >= cells.length) return '';
  return cleanText(cells[index]);
}

function findFirstValidDate(cells: string[], indexes: number[]): Date | null {
  for (const index of indexes) {
    const date = parseDate(getCell(cells, index));
    if (isValidDate(date)) return date;
  }

  return null;
}

function setMetadataValue(currentValue: string, nextValue: string): string {
  return currentValue || nextValue;
}

function extractDateCandidates(text: string): Date[] {
  const matches = text.match(/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/g) ?? [];

  return matches
    .map((match) => parseDate(match))
    .filter((date) => isValidDate(date));
}

function parseMetadataFromCells(
  cells: string[],
  report: ParsedReport,
  reportDateCandidates: Date[]
): void {
  for (let index = 0; index < cells.length; index += 2) {
    const label = normalizeLabel(cells[index]);
    const value = cleanText(cells[index + 1] ?? '');
    if (!label || !value) continue;

    if (/^(account|account number|account no|account #|login)$/.test(label)) {
      const accountMatch = value.match(/\d{4,}/);
      if (accountMatch) {
        report.metadata.account_number = setMetadataValue(report.metadata.account_number, accountMatch[0]);
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

    if (/^(account mode|account type)$/.test(label)) {
      report.metadata.account_mode = value;
      continue;
    }

    if (/^(position mode|positions mode|positions)$/.test(label)) {
      report.metadata.position_mode = value;
      continue;
    }

    if (/^(date|to|report time|generated|period)$/.test(label)) {
      const candidateDates = extractDateCandidates(value);
      reportDateCandidates.push(...candidateDates);
    }
  }
}

function summaryFieldFromLabel(label: string): keyof ParsedReport['accountSummary'] | null {
  if (label.startsWith('balance')) return 'balance';
  if (label.startsWith('equity')) return 'equity';
  if (label === 'margin') return 'margin';
  if (label.includes('free margin')) return 'free_margin';
  if (label.includes('margin level')) return 'margin_level';
  if (label.includes('floating') && (label.includes('p/l') || label.includes('pl') || label.includes('profit'))) {
    return 'floating_pl';
  }

  return null;
}

function parseSummaryRow(cells: string[], report: ParsedReport): void {
  for (let index = 0; index < cells.length - 1; index += 1) {
    const label = summaryFieldFromLabel(normalizeLabel(cells[index]));
    if (!label) continue;

    const value = parseNumber(cells[index + 1]);
    report.accountSummary[label] = value;
  }
}

function parseClosedPositionRow(cells: string[], headerMap: HeaderMap | null): ClosedPositionRow | null {
  const openedAtIdx =
    findColumnIndex(headerMap, ['open time', 'time'], 'first') >= 0
      ? findColumnIndex(headerMap, ['open time', 'time'], 'first')
      : 0;
  const closedAtIdx =
    findColumnIndex(headerMap, ['close time', 'time'], 'last') >= 0
      ? findColumnIndex(headerMap, ['close time', 'time'], 'last')
      : 8;

  const openedAt = parseDate(getCell(cells, openedAtIdx));
  const closedAt = parseDate(getCell(cells, closedAtIdx));

  if (!isValidDate(openedAt) || !isValidDate(closedAt)) {
    return null;
  }

  const positionId = cleanText(
    getCell(cells, findColumnIndex(headerMap, ['position', 'ticket', 'id'], 'first') >= 0
      ? findColumnIndex(headerMap, ['position', 'ticket', 'id'], 'first')
      : 1)
  );
  if (!positionId) return null;

  const symbol = cleanText(
    getCell(cells, findColumnIndex(headerMap, ['symbol'], 'first') >= 0
      ? findColumnIndex(headerMap, ['symbol'], 'first')
      : 2)
  ) || 'UNKNOWN';

  const side =
    cleanText(
      getCell(cells, findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first') >= 0
        ? findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first')
        : 3)
    ) || 'UNKNOWN';

  const volumeIdx = findColumnIndex(headerMap, ['volume'], 'first');
  const openPriceIdx = findColumnIndex(headerMap, ['open price', 'price'], 'first');
  const closePriceIdx = findColumnIndex(headerMap, ['close price', 'price'], 'last');

  return {
    position_id: positionId,
    symbol,
    side,
    volume: parseNumber(getCell(cells, volumeIdx >= 0 ? volumeIdx : 4)),
    open_price: parseNumber(getCell(cells, openPriceIdx >= 0 ? openPriceIdx : 5)),
    close_price: parseNumber(getCell(cells, closePriceIdx >= 0 ? closePriceIdx : 9)),
    commission: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['commission'], 'first') >= 0
        ? findColumnIndex(headerMap, ['commission'], 'first')
        : 10)
    ),
    swap: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['swap'], 'first') >= 0
        ? findColumnIndex(headerMap, ['swap'], 'first')
        : 11)
    ),
    profit: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['profit', 'p/l'], 'first') >= 0
        ? findColumnIndex(headerMap, ['profit', 'p/l'], 'first')
        : 12)
    ),
    opened_at: openedAt,
    closed_at: closedAt,
    comment: cleanText(
      getCell(cells, findColumnIndex(headerMap, ['comment'], 'first') >= 0
        ? findColumnIndex(headerMap, ['comment'], 'first')
        : 13)
    )
  };
}

function parseOrderHistoryRow(cells: string[], headerMap: HeaderMap | null): OrderHistoryRow | null {
  const time = findFirstValidDate(cells, [
    findColumnIndex(headerMap, ['time', 'open time'], 'first'),
    0
  ]);

  if (!time) return null;

  const orderId = cleanText(
    getCell(cells, findColumnIndex(headerMap, ['order', 'ticket', 'id'], 'first') >= 0
      ? findColumnIndex(headerMap, ['order', 'ticket', 'id'], 'first')
      : 1)
  );
  if (!orderId) return null;

  const volume = parseVolume(
    getCell(cells, findColumnIndex(headerMap, ['volume'], 'first') >= 0
      ? findColumnIndex(headerMap, ['volume'], 'first')
      : 4)
  );

  return {
    order_id: orderId,
    symbol:
      cleanText(
        getCell(cells, findColumnIndex(headerMap, ['symbol'], 'first') >= 0
          ? findColumnIndex(headerMap, ['symbol'], 'first')
          : 2)
      ) || 'UNKNOWN',
    type:
      cleanText(
        getCell(cells, findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first') >= 0
          ? findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first')
          : 3)
      ) || 'UNKNOWN',
    volume_requested: volume.req,
    volume_filled: volume.filled,
    price: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['price', 'open price'], 'first') >= 0
        ? findColumnIndex(headerMap, ['price', 'open price'], 'first')
        : 5)
    ),
    sl: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['s/l', 'sl'], 'first') >= 0
        ? findColumnIndex(headerMap, ['s/l', 'sl'], 'first')
        : 6)
    ),
    tp: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['t/p', 'tp'], 'first') >= 0
        ? findColumnIndex(headerMap, ['t/p', 'tp'], 'first')
        : 7)
    ),
    state:
      cleanText(
        getCell(cells, findColumnIndex(headerMap, ['state', 'status'], 'first') >= 0
          ? findColumnIndex(headerMap, ['state', 'status'], 'first')
          : 9)
      ) || 'Filled',
    comment: cleanText(
      getCell(cells, findColumnIndex(headerMap, ['comment'], 'first') >= 0
        ? findColumnIndex(headerMap, ['comment'], 'first')
        : 10)
    )
  };
}

function parseDealRow(cells: string[], headerMap: HeaderMap | null): DealLedgerRow | null {
  const time = findFirstValidDate(cells, [findColumnIndex(headerMap, ['time'], 'first'), 0]);
  if (!time) return null;

  const dealId = cleanText(
    getCell(cells, findColumnIndex(headerMap, ['deal', 'ticket', 'id'], 'first') >= 0
      ? findColumnIndex(headerMap, ['deal', 'ticket', 'id'], 'first')
      : 1)
  );
  if (!dealId) return null;

  return {
    deal_id: dealId,
    time,
    symbol: cleanText(
      getCell(cells, findColumnIndex(headerMap, ['symbol'], 'first') >= 0
        ? findColumnIndex(headerMap, ['symbol'], 'first')
        : 2)
    ),
    type:
      cleanText(
        getCell(cells, findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first') >= 0
          ? findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first')
          : 3)
      ) || 'UNKNOWN',
    volume: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['volume'], 'first') >= 0
        ? findColumnIndex(headerMap, ['volume'], 'first')
        : 4)
    ),
    price: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['price'], 'first') >= 0
        ? findColumnIndex(headerMap, ['price'], 'first')
        : 5)
    ),
    commission: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['commission'], 'first') >= 0
        ? findColumnIndex(headerMap, ['commission'], 'first')
        : 8)
    ),
    swap: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['swap'], 'first') >= 0
        ? findColumnIndex(headerMap, ['swap'], 'first')
        : 9)
    ),
    profit: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['profit', 'p/l'], 'first') >= 0
        ? findColumnIndex(headerMap, ['profit', 'p/l'], 'first')
        : 10)
    ),
    balance_after: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['balance', 'balance after'], 'first'))
    ),
    comment: cleanText(
      getCell(cells, findColumnIndex(headerMap, ['comment'], 'first') >= 0
        ? findColumnIndex(headerMap, ['comment'], 'first')
        : cells.length - 1)
    )
  };
}

function parseOpenPositionRow(cells: string[], headerMap: HeaderMap | null): OpenPositionRow | null {
  const time = findFirstValidDate(cells, [
    findColumnIndex(headerMap, ['open time', 'time'], 'first'),
    0
  ]);
  if (!time) return null;

  const positionId = cleanText(
    getCell(cells, findColumnIndex(headerMap, ['position', 'ticket', 'id'], 'first') >= 0
      ? findColumnIndex(headerMap, ['position', 'ticket', 'id'], 'first')
      : 1)
  );
  if (!positionId) return null;

  return {
    position_id: positionId,
    symbol:
      cleanText(
        getCell(cells, findColumnIndex(headerMap, ['symbol'], 'first') >= 0
          ? findColumnIndex(headerMap, ['symbol'], 'first')
          : 2)
      ) || 'UNKNOWN',
    side:
      cleanText(
        getCell(cells, findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first') >= 0
          ? findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first')
          : 3)
      ) || 'UNKNOWN',
    volume: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['volume'], 'first') >= 0
        ? findColumnIndex(headerMap, ['volume'], 'first')
        : 4)
    ),
    open_price: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['open price', 'price'], 'first') >= 0
        ? findColumnIndex(headerMap, ['open price', 'price'], 'first')
        : 5)
    ),
    market_price: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['market price', 'price'], 'last') >= 0
        ? findColumnIndex(headerMap, ['market price', 'price'], 'last')
        : 8)
    ),
    swap: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['swap'], 'first') >= 0
        ? findColumnIndex(headerMap, ['swap'], 'first')
        : 9)
    ),
    floating_profit: parseNumber(
      getCell(
        cells,
        findColumnIndex(headerMap, ['profit', 'floating p/l', 'floating pl', 'p/l'], 'first') >= 0
          ? findColumnIndex(headerMap, ['profit', 'floating p/l', 'floating pl', 'p/l'], 'first')
          : 10
      )
    ),
    comment: cleanText(
      getCell(cells, findColumnIndex(headerMap, ['comment'], 'first') >= 0
        ? findColumnIndex(headerMap, ['comment'], 'first')
        : 11)
    )
  };
}

function parseWorkingOrderRow(cells: string[], headerMap: HeaderMap | null): WorkingOrderRow | null {
  const time = findFirstValidDate(cells, [
    findColumnIndex(headerMap, ['time', 'open time'], 'first'),
    0
  ]);
  if (!time) return null;

  const orderId = cleanText(
    getCell(cells, findColumnIndex(headerMap, ['order', 'ticket', 'id'], 'first') >= 0
      ? findColumnIndex(headerMap, ['order', 'ticket', 'id'], 'first')
      : 1)
  );
  if (!orderId) return null;

  return {
    order_id: orderId,
    symbol:
      cleanText(
        getCell(cells, findColumnIndex(headerMap, ['symbol'], 'first') >= 0
          ? findColumnIndex(headerMap, ['symbol'], 'first')
          : 2)
      ) || 'UNKNOWN',
    type:
      cleanText(
        getCell(cells, findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first') >= 0
          ? findColumnIndex(headerMap, ['type', 'side', 'direction'], 'first')
          : 3)
      ) || 'UNKNOWN',
    volume: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['volume'], 'first') >= 0
        ? findColumnIndex(headerMap, ['volume'], 'first')
        : 4)
    ),
    price: parseNumber(
      getCell(cells, findColumnIndex(headerMap, ['price'], 'first') >= 0
        ? findColumnIndex(headerMap, ['price'], 'first')
        : 5)
    ),
    state:
      cleanText(
        getCell(cells, findColumnIndex(headerMap, ['state', 'status'], 'first') >= 0
          ? findColumnIndex(headerMap, ['state', 'status'], 'first')
          : 9)
      ) || 'Working',
    comment: cleanText(
      getCell(cells, findColumnIndex(headerMap, ['comment'], 'first') >= 0
        ? findColumnIndex(headerMap, ['comment'], 'first')
        : 10)
    )
  };
}

function parseTableRows(
  $table: cheerio.Cheerio,
  $: cheerio.Root,
  report: ParsedReport,
  reportDateCandidates: Date[]
): void {
  let currentSection = inferTableSection($table, $);
  let headerMap: HeaderMap | null = null;

  $table.find('tr').each((_, row) => {
    const $row = $(row);
    const cells = getRowCells($row, $);
    if (cells.length === 0) return;

    const sectionLabel = cells.length <= 2 ? detectSection(cells.join(' ')) : '';
    if (sectionLabel) {
      currentSection = sectionLabel;
      headerMap = null;
      return;
    }

    parseMetadataFromCells(cells, report, reportDateCandidates);
    parseSummaryRow(cells, report);

    if (isLikelyHeaderRow(cells)) {
      headerMap = buildHeaderMap(cells);
      return;
    }

    if (!currentSection) return;

    if (currentSection === 'Positions') {
      const parsed = parseClosedPositionRow(cells, headerMap);
      if (parsed) report.closedPositions.push(parsed);
      return;
    }

    if (currentSection === 'Orders') {
      const parsed = parseOrderHistoryRow(cells, headerMap);
      if (parsed) report.orderHistory.push(parsed);
      return;
    }

    if (currentSection === 'Deals') {
      const parsed = parseDealRow(cells, headerMap);
      if (parsed) report.dealLedger.push(parsed);
      return;
    }

    if (currentSection === 'Open Positions') {
      const parsed = parseOpenPositionRow(cells, headerMap);
      if (parsed) report.openPositions.push(parsed);
      return;
    }

    if (currentSection === 'Working Orders') {
      const parsed = parseWorkingOrderRow(cells, headerMap);
      if (parsed) report.workingOrders.push(parsed);
    }
  });
}

function inferReportTimestamp(report: ParsedReport, reportDateCandidates: Date[]): Date {
  const validReportDates = reportDateCandidates.filter((date) => isValidDate(date));
  if (validReportDates.length > 0) {
    return validReportDates.reduce((latest, current) =>
      current.getTime() > latest.getTime() ? current : latest
    );
  }

  const recordDates: Date[] = [
    ...report.dealLedger.map((deal) => deal.time),
    ...report.closedPositions.map((position) => position.closed_at)
  ].filter((date) => isValidDate(date));

  if (recordDates.length > 0) {
    return recordDates.reduce((latest, current) =>
      current.getTime() > latest.getTime() ? current : latest
    );
  }

  return new Date();
}

export function parseReport(htmlContent: string): ParsedReport {
  const $ = cheerio.load(htmlContent);
  const fileHash = crypto.createHash('sha256').update(htmlContent).digest('hex');

  const report: ParsedReport = {
    fileHash,
    metadata: {
      account_number: '',
      owner_name: '',
      currency: 'USD',
      server: '',
      account_mode: '',
      position_mode: '',
      report_timestamp: new Date()
    },
    closedPositions: [],
    orderHistory: [],
    dealLedger: [],
    openPositions: [],
    workingOrders: [],
    accountSummary: {
      balance: 0,
      equity: 0,
      margin: 0,
      free_margin: 0,
      floating_pl: 0,
      margin_level: 0
    }
  };

  const title = $('title').text() || $('h1').first().text();
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

  $('tr').each((_, row) => {
    const cells = getRowCells($(row), $);
    if (cells.length === 0) return;

    parseMetadataFromCells(cells, report, reportDateCandidates);
    parseSummaryRow(cells, report);
  });

  $('table').each((_, table) => {
    parseTableRows($(table), $, report, reportDateCandidates);
  });

  report.metadata.report_timestamp = inferReportTimestamp(report, reportDateCandidates);

  if (report.accountSummary.floating_pl === 0 && report.openPositions.length > 0) {
    report.accountSummary.floating_pl = report.openPositions.reduce(
      (sum, position) => sum + position.floating_profit,
      0
    );
  }

  report.dealLedger.sort((left, right) => left.time.getTime() - right.time.getTime());

  const hasExplicitBalanceAfter = report.dealLedger.some(
    (deal) => Number.isFinite(deal.balance_after) && deal.balance_after !== 0
  );

  if (!hasExplicitBalanceAfter) {
    let runningBalance = 0;
    for (const deal of report.dealLedger) {
      runningBalance += (deal.profit || 0) + (deal.commission || 0) + (deal.swap || 0);
      deal.balance_after = runningBalance;
    }
  }

  report.metadata.account_number = cleanText(report.metadata.account_number);
  report.metadata.owner_name = cleanText(report.metadata.owner_name);
  report.metadata.currency = cleanText(report.metadata.currency) || 'USD';
  report.metadata.server = cleanText(report.metadata.server);
  report.metadata.account_mode = cleanText(report.metadata.account_mode);
  report.metadata.position_mode = cleanText(report.metadata.position_mode);

  return report;
}
