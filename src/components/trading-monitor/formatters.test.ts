import assert from "node:assert/strict";
import test from "node:test";

import { formatCompactSignedNumber } from "./formatters";

test("formatCompactSignedNumber renders compact signed values", () => {
  assert.equal(formatCompactSignedNumber(12.3, 1), "+12.3");
  assert.equal(formatCompactSignedNumber(12345, 1), "+12.3K");
  assert.equal(formatCompactSignedNumber(-12345, 1), "-12.3K");
});
