import assert from "node:assert/strict";
import test from "node:test";

import { parseDate, parseReport, parseReportDate } from "./index";

test("parseReport keeps account summary balance separate from drawdown result rows", () => {
  const report = parseReport(`
    <html>
      <body>
        <table>
          <tr align="right">
            <td colspan="3">Balance:</td>
            <td colspan="2"><b>12 838.82</b></td>
            <td></td>
            <td colspan="3">Free Margin:</td>
            <td colspan="2"><b>2 113.08</b></td>
          </tr>
          <tr align="right">
            <td colspan="3">Credit Facility:</td>
            <td colspan="2"><b>0.00</b></td>
            <td></td>
            <td colspan="3">Margin:</td>
            <td colspan="2"><b>9 134.99</b></td>
          </tr>
          <tr align="right">
            <td colspan="3">Floating P/L:</td>
            <td colspan="2"><b>-1 794.10</b></td>
            <td></td>
            <td colspan="3">Margin Level:</td>
            <td colspan="2"><b>123.13%</b></td>
          </tr>
          <tr align="right">
            <td colspan="3">Equity:</td>
            <td colspan="2"><b>11 248.07</b></td>
          </tr>
          <tr align="right">
            <td nowrap colspan="3">Balance Drawdown Absolute:</td>
            <td nowrap><b>507.48</b></td>
            <td nowrap colspan="3">Balance Drawdown Maximal:</td>
            <td nowrap><b>2 065.28 (21.68%)</b></td>
            <td nowrap colspan="3">Balance Drawdown Relative:</td>
            <td nowrap colspan="2"><b>21.68% (2 065.28)</b></td>
          </tr>
        </table>
      </body>
    </html>
  `);

  assert.equal(report.accountSummary.balance, 12838.82);
  assert.equal(report.accountSummary.free_margin, 2113.08);
  assert.equal(report.accountSummary.margin, 9134.99);
  assert.equal(report.accountSummary.floating_pl, -1794.1);
  assert.equal(report.accountSummary.margin_level, 123.13);
  assert.equal(report.accountSummary.equity, 11248.07);
});

test("parseReport preserves full drawdown amount and percent values", () => {
  const report = parseReport(`
    <html>
      <body>
        <table>
          <tr align="right">
            <td nowrap colspan="3">Balance Drawdown Absolute:</td>
            <td nowrap><b>507.48</b></td>
            <td nowrap colspan="3">Balance Drawdown Maximal:</td>
            <td nowrap><b>2 065.28 (21.68%)</b></td>
            <td nowrap colspan="3">Balance Drawdown Relative:</td>
            <td nowrap colspan="2"><b>21.68% (2 065.28)</b></td>
          </tr>
        </table>
      </body>
    </html>
  `);

  assert.equal(report.reportResults?.balance_drawdown_absolute, 507.48);
  assert.equal(report.reportResults?.balance_drawdown_maximal, 2065.28);
  assert.equal(report.reportResults?.balance_drawdown_maximal_pct, 21.68);
  assert.equal(report.reportResults?.balance_drawdown_relative_pct, 21.68);
  assert.equal(report.reportResults?.balance_drawdown_relative, 2065.28);
});

test("parseDate keeps table timestamps at their original wall-clock time", () => {
  const parsed = parseDate("2026.04.12 11:25:00");
  assert.equal(parsed.toISOString(), "2026-04-12T11:25:00.000Z");
});

test("parseReportDate stores report timestamps as Bangkok time without browser-side drift", () => {
  const parsed = parseReportDate("2026.04.12 11:25:00");
  assert.equal(parsed.toISOString(), "2026-04-12T04:25:00.000Z");
});
