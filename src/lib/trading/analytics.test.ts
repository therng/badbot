import test from "node:test";
import assert from "node:assert/strict";

import { computeBalanceDrawdown, computeDepositLoadPercent } from "./analytics";

test("computeBalanceDrawdown tracks maximal and relative drawdown independently", () => {
  const drawdown = computeBalanceDrawdown([
    {
      time: new Date("2026-04-01T00:00:00Z"),
      type: "balance",
      comment: "deposit",
      profit: 1000,
      commission: 0,
      swap: 0,
      balance: 1000,
    },
    {
      time: new Date("2026-04-01T01:00:00Z"),
      type: "buy",
      profit: 1000,
      commission: 0,
      swap: 0,
      balance: 2000,
    },
    {
      time: new Date("2026-04-01T02:00:00Z"),
      type: "sell",
      profit: -600,
      commission: 0,
      swap: 0,
      balance: 1400,
    },
    {
      time: new Date("2026-04-01T03:00:00Z"),
      type: "buy",
      profit: 2000,
      commission: 0,
      swap: 0,
      balance: 3400,
    },
    {
      time: new Date("2026-04-01T04:00:00Z"),
      type: "sell",
      profit: -700,
      commission: 0,
      swap: 0,
      balance: 2700,
    },
  ]);

  assert.equal(drawdown.maximalAmount, 700);
  assert.ok(Math.abs(drawdown.maximalPercent - 20.588235294117645) < 1e-9);
  assert.equal(drawdown.relativeAmount, 600);
  assert.equal(drawdown.relativePercent, 30);
});

test("computeBalanceDrawdown ignores balance, deposit, and withdrawal deals in trade drawdown", () => {
  const drawdown = computeBalanceDrawdown([
    {
      time: new Date("2026-04-02T00:00:00Z"),
      type: "balance",
      comment: "deposit",
      profit: 1000,
      commission: 0,
      swap: 0,
      balance: 1000,
    },
    {
      time: new Date("2026-04-02T01:00:00Z"),
      type: "buy",
      profit: 500,
      commission: 0,
      swap: 0,
      balance: 1500,
    },
    {
      time: new Date("2026-04-02T02:00:00Z"),
      type: "balance",
      comment: "withdrawal",
      profit: -900,
      commission: 0,
      swap: 0,
      balance: 600,
    },
    {
      time: new Date("2026-04-02T03:00:00Z"),
      type: "sell",
      profit: -300,
      commission: 0,
      swap: 0,
      balance: 300,
    },
  ]);

  assert.equal(drawdown.maximalAmount, 300);
  assert.equal(drawdown.relativePercent, 20);
});

test("computeDepositLoadPercent uses margin plus floating loss only", () => {
  assert.equal(
    computeDepositLoadPercent({
      totalDeposit: 1000,
      margin: 200,
      floatingProfit: 125,
    }),
    20,
  );

  assert.equal(
    computeDepositLoadPercent({
      totalDeposit: 1000,
      margin: 200,
      floatingProfit: -125,
    }),
    32.5,
  );

  assert.equal(
    computeDepositLoadPercent({
      totalDeposit: 0,
      margin: 200,
      floatingProfit: -125,
    }),
    null,
  );
});
