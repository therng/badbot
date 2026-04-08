import test from "node:test";
import assert from "node:assert/strict";

import { Prisma } from "@prisma/client";

import { calculateReportResults } from "./calculate-report-results";

test("calculateReportResults nulls decimal metrics that exceed DECIMAL(28,8) range", () => {
  const huge = new Prisma.Decimal("100000000000000000000");
  const warningMessages: string[] = [];
  const originalWarn = console.warn;

  console.warn = (message?: unknown) => {
    warningMessages.push(String(message));
  };

  try {
    const result = calculateReportResults({
      positions: [
        {
          positionNo: "1",
          openTime: new Date("2026-04-07T00:00:00Z"),
          closeTime: new Date("2026-04-07T01:00:00Z"),
          type: "buy",
          profit: huge,
          commission: 0,
          swap: 0,
        },
      ],
      deals: [
        {
          dealNo: "1",
          time: new Date("2026-04-07T01:00:00Z"),
          type: "buy",
          comment: null,
          profit: huge,
          commission: 0,
          swap: 0,
          balance: huge,
        },
      ],
    });

    assert.equal(result.totalNetProfit, null);
    assert.equal(result.grossProfit, null);
    assert.equal(result.expectedPayoff, null);
    assert.equal(result.largestProfitTrade, null);
    assert.equal(result.averageProfitTrade, null);
    assert.ok(warningMessages.some((message) => message.includes("totalNetProfit")));
  } finally {
    console.warn = originalWarn;
  }
});
