import { parseNumber, parseDate, parseVolume, parseReport } from './index';

describe('Parser Utilities', () => {
  it('should parse numbers correctly', () => {
    expect(parseNumber('25 957.00')).toBe(25957.00);
    expect(parseNumber('1,000.50')).toBe(1000.50);
    expect(parseNumber('')).toBe(0);
  });

  it('should parse volumes correctly', () => {
    expect(parseVolume('0.08 / 0')).toEqual({ req: 0.08, filled: 0 });
    expect(parseVolume('1.5')).toEqual({ req: 1.5, filled: 1.5 });
  });

  it('should parse dates correctly', () => {
    const d = parseDate('2023.10.15 14:30:00');
    expect(d.getUTCFullYear()).toBe(2023);
    expect(d.getUTCMonth()).toBe(9); // 0-indexed
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(14);
    expect(d.getUTCMinutes()).toBe(30);
  });
});

describe('parseReport', () => {
  const mockHtml = `
    <html>
      <head>
        <title>ReportHistory-123456</title>
      </head>
      <body>
        <div>Positions</div>
        <table>
          <tr>
            <td>Time</td>
            <td>Ticket</td>
            <td>Symbol</td>
            <td>Type</td>
            <td>Volume</td>
            <td>Price</td>
            <td>S/L</td>
            <td>T/P</td>
            <td>Time</td>
            <td>Price</td>
            <td>Commission</td>
            <td>Swap</td>
            <td>Profit</td>
            <td>Comment</td>
          </tr>
          <tr>
            <td>2023.10.15 14:00:00</td>
            <td>111</td>
            <td>EURUSD</td>
            <td>buy</td>
            <td>0.1</td>
            <td>1.0500</td>
            <td>1.0400</td>
            <td>1.0600</td>
            <td>2023.10.15 15:00:00</td>
            <td>1.0550</td>
            <td>0</td>
            <td>0</td>
            <td>50.00</td>
            <td></td>
          </tr>
        </table>
        <div>Summary</div>
        <table>
          <tr><td>Balance:</td><td>10 000.00</td></tr>
          <tr><td>Equity:</td><td>10 050.00</td></tr>
        </table>
      </body>
    </html>
  `;

  it('should parse full report structure', () => {
    const report = parseReport(mockHtml);
    expect(report.metadata.account_number).toBe('123456');
    expect(report.metadata.owner_name).toBe('');
    expect(report.metadata.server).toBe('');
    expect(report.closedPositions.length).toBe(1);
    expect(report.closedPositions[0].symbol).toBe('EURUSD');
    expect(report.closedPositions[0].profit).toBe(50);
    expect(report.accountSummary.balance).toBe(10000);
    expect(report.accountSummary.equity).toBe(10050);
  });
});
