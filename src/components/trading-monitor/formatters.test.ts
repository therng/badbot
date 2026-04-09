import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCompactCount,
  formatCompactNumber,
  formatCompactSignedNumber,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  stripTrailingZero,
} from "./formatters";

test("full currency view keeps two decimals and symbol placement", () => {
  assert.equal(formatCurrency(1234.567), "$1,234.57");
  assert.equal(formatCurrency(-1200), "-$1,200.00");
  assert.equal(formatCurrency(0), "$0.00");
  assert.equal(formatSignedCurrency(16930), "+$16,930.00");
  assert.equal(formatSignedCurrency(-35000), "-$35,000.00");
});

test("compact view uses uppercase suffixes with no currency symbol", () => {
  assert.equal(formatCompactNumber(999), "999");
  assert.equal(formatCompactNumber(1000), "1K");
  assert.equal(formatCompactNumber(1200), "1.2K");
  assert.equal(formatCompactNumber(16930), "16.9K");
  assert.equal(formatCompactNumber(1_250_000), "1.3M");
  assert.equal(formatCompactNumber(1_000_000_000), "1B");
  assert.equal(formatCompactSignedNumber(35_830.57), "+35.8K");
  assert.equal(formatCompactSignedNumber(-16_930), "-16.9K");
});

test("compact threshold edge cases round only at render time", () => {
  assert.equal(formatCompactNumber(999.95), "1K");
  assert.equal(formatCompactNumber(999_500), "999.5K");
  assert.equal(formatCompactNumber(999_950), "1M");
  assert.equal(formatCompactNumber(1_000_000), "1M");
});

test("compact counts follow chip rules without currency or sign", () => {
  assert.equal(formatCompactCount(999), "999");
  assert.equal(formatCompactCount(1200), "1.2K");
  assert.equal(formatCompactCount(12_400), "12.4K");
});

test("percent formatting defaults to one decimal with half-up rounding", () => {
  assert.equal(formatPercent(12.34), "+12.3%");
  assert.equal(formatPercent(-12.35), "-12.4%");
  assert.equal(formatPercent(0), "0%");
});

test("helpers strip trailing zeros consistently", () => {
  assert.equal(stripTrailingZero("1.0"), "1");
  assert.equal(stripTrailingZero("1.20"), "1.2");
  assert.equal(stripTrailingZero("16.90K"), "16.9K");
});
