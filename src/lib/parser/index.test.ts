import test from "node:test";
import assert from "node:assert/strict";

import { parseReport } from "./index";

function renderTable(rows: string[][]) {
  return `
    <html>
      <body>
        <table>
          ${rows
            .map(
              (row) => `
                <tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>
              `,
            )
            .join("")}
        </table>
      </body>
    </html>
  `;
}

test("parseReport rejects malformed closed positions with zero open and close prices", () => {
  const report = parseReport(
    renderTable([
      ["Positions"],
      [
        "Time",
        "Position",
        "Symbol",
        "Type",
        "Volume",
        "Price",
        "S/L",
        "T/P",
        "Time",
        "Price",
        "Commission",
        "Swap",
        "Profit",
        "Comment",
      ],
      [
        "2026.04.07 10:00:00",
        "1001",
        "EURUSD",
        "buy",
        "1.00",
        "0",
        "",
        "",
        "2026.04.07 12:00:00",
        "0",
        "-2.5",
        "-0.3",
        "25",
        "broken row",
      ],
    ]),
  );

  assert.equal(report.positions.length, 0);
});

test("parseReport rejects headerless malformed position rows when fallback cells contain comment text", () => {
  const report = parseReport(
    renderTable([
      ["Positions"],
      [
        "2026.04.07 10:00:00",
        "1002",
        "GBPUSD",
        "sell",
        "0.50",
        "1.2450",
        "",
        "",
        "2026.04.07 11:00:00",
        "1.2400",
        "comment 123",
        "swap 5",
        "profit 20",
      ],
    ]),
  );

  assert.equal(report.positions.length, 0);
});

test("parseReport keeps closed-position comment null when the positions table has no comment column", () => {
  const report = parseReport(
    renderTable([
      ["Positions"],
      [
        "Time",
        "Position",
        "Symbol",
        "Type",
        "Volume",
        "Price",
        "S/L",
        "T/P",
        "Time",
        "Price",
        "Commission",
        "Swap",
        "Profit",
      ],
      [
        "2026.04.07 10:00:00",
        "1003",
        "EURUSD",
        "buy",
        "1.00",
        "1.1000",
        "",
        "",
        "2026.04.07 12:00:00",
        "1.1050",
        "-2.5",
        "-0.3",
        "25",
      ],
    ]),
  );

  assert.equal(report.positions.length, 1);
  assert.equal(report.positions[0]?.comment, null);
  assert.equal(report.positions[0]?.profit, 25);
});
