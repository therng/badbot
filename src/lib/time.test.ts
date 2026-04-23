import assert from "node:assert/strict";
import test from "node:test";

import {
  getThaiDateKeyFromTableTime,
  getThaiHourFromTableTime,
  parseBangkokDate,
  resolveMarketSession,
} from "./time";

test("maps table midnight boundary to the Thai account day", () => {
  const tableTime = new Date("2026-04-14T20:00:00.000Z");

  assert.equal(getThaiDateKeyFromTableTime(tableTime), "2026-04-15");
  assert.equal(getThaiHourFromTableTime(tableTime), 0);
});

test("maps table afternoon time without applying the Bangkok offset twice", () => {
  const tableTime = new Date("2026-04-15T13:30:00.000Z");

  assert.equal(getThaiDateKeyFromTableTime(tableTime), "2026-04-15");
  assert.equal(getThaiHourFromTableTime(tableTime), 17);
});

test("maps table evening time across the Thai account day boundary", () => {
  const tableTime = new Date("2026-04-15T20:30:00.000Z");

  assert.equal(getThaiDateKeyFromTableTime(tableTime), "2026-04-16");
  assert.equal(getThaiHourFromTableTime(tableTime), 0);
});

test("parses account dates as Bangkok time", () => {
  const parsed = parseBangkokDate("2026.04.15 17:30:00");

  assert.equal(parsed.toISOString(), "2026-04-15T10:30:00.000Z");
});

test("resolves Bangkok 07:00 to the asia session", () => {
  assert.equal(resolveMarketSession(new Date("2026-04-22T00:00:00.000Z")), "asia");
});

test("resolves Bangkok 14:00 to the london session", () => {
  assert.equal(resolveMarketSession(new Date("2026-04-22T07:00:00.000Z")), "london");
});

test("resolves Bangkok 20:00 to the ny session", () => {
  assert.equal(resolveMarketSession(new Date("2026-04-22T13:00:00.000Z")), "ny");
});

test("resolves Bangkok 02:00 to the overnight session", () => {
  assert.equal(resolveMarketSession(new Date("2026-04-21T19:00:00.000Z")), "overnight");
});
