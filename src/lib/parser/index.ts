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
  closedPositions: any[];
  orderHistory: any[];
  dealLedger: any[];
  openPositions: any[];
  workingOrders: any[];
  accountSummary: {
    balance: number;
    equity: number;
    margin: number;
    free_margin: number;
    floating_pl: number;
    margin_level: number;
  };
}

export function parseNumber(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/\s/g, '').replace(/,/g, '')) || 0;
}

export function parseDate(val: string): Date {
  if (!val) return new Date();
  const parts = val.replace(/\s/g, ' ').split(' ');
  if (parts.length >= 2) {
    const [datePart, timePart] = parts;
    const [y, m, d] = datePart.split('.');
    return new Date(`${y}-${m}-${d}T${timePart}Z`);
  }
  return new Date();
}

export function parseVolume(val: string): { req: number; filled: number } {
  if (!val) return { req: 0, filled: 0 };
  if (val.includes('/')) {
    const [r, f] = val.split('/').map(v => parseNumber(v));
    return { req: r, filled: f };
  }
  return { req: parseNumber(val), filled: parseNumber(val) };
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
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

  // Attempt to parse metadata from the first few headers
  const title = $('title').text() || $('h1').first().text();
  const titleMatch = title.match(/^(\d+):\s+(.+?)\s+-/);
  if (titleMatch) {
    report.metadata.account_number = cleanText(titleMatch[1]);
    report.metadata.owner_name = cleanText(titleMatch[2]);
  } else {
    const titleMatchOld = title.match(/ReportHistory-(\d+)/);
    if (titleMatchOld) {
      report.metadata.account_number = cleanText(titleMatchOld[1]);
    }
  }

  let currentSection = '';
  let isHeader = false;

  $('tr').each((_, row) => {
    const $row = $(row);
    const thText = $row.find('th').text().replace(/\s+/g, ' ').trim();
    if (thText) {
      if (thText === 'Positions') currentSection = 'Positions';
      else if (thText === 'Orders') currentSection = 'Orders';
      else if (thText === 'Deals') currentSection = 'Deals';
      else if (thText === 'Open Positions') currentSection = 'Open Positions';
      else if (thText === 'Working Orders') currentSection = 'Working Orders';
      else if (thText.includes('Summary')) currentSection = 'Summary';
      isHeader = true;
      return;
    }

    const cols = $row.find('td').map((_, el) => $(el).text().trim()).toArray() as unknown as string[];
    if (cols.length === 0) return;
    
    // Header row skip
    if (cols[0] === 'Time' || cols[0] === 'Open Time' || cols[0] === 'Ticket') {
      isHeader = false;
      return;
    }

    // Globals for summary at the bottom
    if (cols[0] === 'Balance:') {
      report.accountSummary.balance = parseNumber(cols[1]);
      if (cols[3] === 'Free Margin:') {
        report.accountSummary.free_margin = parseNumber(cols[4]);
      }
    } else if (cols[0] === 'Credit Facility:') {
      if (cols[3] === 'Margin:') {
        report.accountSummary.margin = parseNumber(cols[4]);
      }
    } else if (cols[0] === 'Equity:') {
      report.accountSummary.equity = parseNumber(cols[1]);
    } else if (cols[0] === 'Floating P/L:') {
      report.accountSummary.floating_pl = parseNumber(cols[1]);
    }

    if (!isHeader) {
      // Very rough column mapping for MT5 standard
      if (currentSection === 'Positions') {
        if (cols.length >= 13 && cols[0] && parseDate(cols[0]).getTime() > 0) {
          report.closedPositions.push({
            position_id: cols[1],
            symbol: cols[2],
            side: cols[3],
            volume: parseNumber(cols[5]),
            open_price: parseNumber(cols[6]),
            close_price: parseNumber(cols[10]),
            profit: parseNumber(cols[13]),
            swap: parseNumber(cols[12]),
            commission: parseNumber(cols[11]),
            opened_at: parseDate(cols[0]),
            closed_at: parseDate(cols[9]),
            comment: cols[14] || ''
          });
        }
      } else if (currentSection === 'Orders') {
         if (cols.length >= 11 && cols[0] && parseDate(cols[0]).getTime() > 0) {
           const vol = parseVolume(cols[4]);
           report.orderHistory.push({
             order_id: cols[1],
             symbol: cols[2],
             type: cols[3],
             volume_requested: vol.req,
             volume_filled: vol.filled,
             price: parseNumber(cols[5]),
             sl: parseNumber(cols[6]),
             tp: parseNumber(cols[7]),
             state: cols[9] || 'Filled',
             comment: cols[11] || ''
           });
         }
      } else if (currentSection === 'Deals') {
         if (cols.length >= 12 && cols[0] && parseDate(cols[0]).getTime() > 0) {
           report.dealLedger.push({
             deal_id: cols[1],
             time: parseDate(cols[0]),
             symbol: cols[2],
             type: cols[3],
             volume: parseNumber(cols[5]),
             price: parseNumber(cols[6]),
             commission: parseNumber(cols[9]),
             swap: parseNumber(cols[11]),
             profit: parseNumber(cols[12]),
             balance_after: 0, // In MT5 deals, balance_after is often not explicitly present.
             comment: cols[13] || ''
           });
         }
      } else if (currentSection === 'Open Positions') {
         if (cols.length >= 8 && cols[0] && parseDate(cols[0]).getTime() > 0) {
           report.openPositions.push({
             position_id: cols[1],
             symbol: cols[2],
             side: cols[3],
             volume: parseNumber(cols[5]),
             open_price: parseNumber(cols[6]),
             market_price: parseNumber(cols[7]),
             floating_profit: parseNumber(cols[10]),
             swap: parseNumber(cols[9] || '0'),
             comment: cols[11] || ''
           });
         }
      }
    }
  });

  // Synthesize AccountSummary Floating PL if not present and if open positions exist
  if (report.accountSummary.floating_pl === 0 && report.openPositions.length > 0) {
    report.accountSummary.floating_pl = report.openPositions.reduce((acc, p) => acc + p.floating_profit, 0);
  }

  // Synthesize Deal Ledger Balance
  let currentBalance = 0;
  // Let's check if the first deal is an initial deposit
  report.dealLedger = report.dealLedger.sort((a, b) => a.time.getTime() - b.time.getTime());
  
  for (const deal of report.dealLedger) {
    currentBalance += (deal.profit || 0) + (deal.commission || 0) + (deal.swap || 0);
    deal.balance_after = currentBalance;
  }

  report.metadata.account_number = cleanText(report.metadata.account_number);
  report.metadata.owner_name = cleanText(report.metadata.owner_name);
  report.metadata.currency = cleanText(report.metadata.currency) || 'USD';
  report.metadata.server = cleanText(report.metadata.server);
  report.metadata.account_mode = cleanText(report.metadata.account_mode);
  report.metadata.position_mode = cleanText(report.metadata.position_mode);

  return report;
}
