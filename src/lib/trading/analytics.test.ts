import assert from "node:assert/strict";
import test from "node:test";

import { getAccountStatus, getSinceDate } from "./analytics";

test("getAccountStatus keeps same-day report snapshots active by default", () => {
  const now = new Date("2026-04-15T18:00:00.000Z");
  const sameDaySnapshot = new Date("2026-04-15T02:30:00.000Z");

  const originalNow = Date.now;
  Date.now = () => now.getTime();

  try {
    assert.equal(getAccountStatus(sameDaySnapshot), "Active");
  } finally {
    Date.now = originalNow;
  }
});

test("getAccountStatus marks stale snapshots inactive after the daily freshness window", () => {
  const now = new Date("2026-04-15T18:00:00.000Z");
  const staleSnapshot = new Date("2026-04-14T10:59:59.000Z");

  const originalNow = Date.now;
  Date.now = () => now.getTime();

  try {
    assert.equal(getAccountStatus(staleSnapshot), "Inactive");
  } finally {
    Date.now = originalNow;
  }
});

test("getSinceDate uses Thai day boundaries translated into table time for 1d", () => {
  const reportTime = new Date("2026-04-15T05:00:00.000Z");
  const since = getSinceDate("1d", reportTime);

  assert.ok(since instanceof Date);
  assert.equal(since?.toISOString(), "2026-04-14T20:00:00.000Z");
});
