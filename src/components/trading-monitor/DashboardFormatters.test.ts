import assert from "node:assert/strict";
import test from "node:test";

import { formatTradeHistoryDateTime, formatCompactPercent } from "./DashboardFormatters";

test("formatTradeHistoryDateTime renders the original table wall-clock time", () => {
  assert.equal(
    formatTradeHistoryDateTime(new Date("2026-04-12T01:25:00.000Z")),
    "2026.04.12 01:25:00",
  );
});

test("formatTradeHistoryDateTime does not convert raw table timestamps to Bangkok time", () => {
  assert.equal(
    formatTradeHistoryDateTime(new Date("2026-04-12T04:25:00.000Z")),
    "2026.04.12 04:25:00",
  );
});

test("formatCompactPercent formats large percentages correctly", () => {
  assert.equal(formatCompactPercent(1234.56, 1), "1.2K%");
  assert.equal(formatCompactPercent(999, 1), "999%");
  assert.equal(formatCompactPercent(1000000, 1), "1M%");
  assert.equal(formatCompactPercent(null, 1), "-");
  assert.equal(formatCompactPercent(undefined, 1), "-");
});
