import assert from "node:assert/strict";
import test from "node:test";

import type { LoadingInsightResponse } from "@/app/api/loading-insight/route";

import {
  AI_LOGIN_CACHE_KEY,
  parseLoadingInsightCache,
  writeLoadingInsightCache,
} from "./ai-login-cache";

const payload: LoadingInsightResponse = {
  insights: [
    "trend",
    "liquidity",
    "risk",
    "strategy",
    "news",
    "price action",
  ],
  source: "local",
};

function createStorage() {
  const state = new Map<string, string>();

  return {
    getItem(key: string) {
      return state.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

test("parseLoadingInsightCache accepts same-session cache within TTL", () => {
  const now = new Date("2026-04-22T01:00:00.000Z");
  const raw = JSON.stringify({
    data: payload,
    timestamp: now.getTime() - 60_000,
    session: "asia",
  });

  assert.deepEqual(parseLoadingInsightCache(raw, now), payload);
});

test("parseLoadingInsightCache invalidates cache when session changes before TTL expiry", () => {
  const now = new Date("2026-04-22T07:00:00.000Z");
  const raw = JSON.stringify({
    data: payload,
    timestamp: now.getTime() - 60_000,
    session: "asia",
  });

  assert.equal(parseLoadingInsightCache(raw, now), null);
});

test("parseLoadingInsightCache invalidates legacy cache without session metadata", () => {
  const now = new Date("2026-04-22T01:00:00.000Z");
  const raw = JSON.stringify({
    data: payload,
    timestamp: now.getTime() - 60_000,
  });

  assert.equal(parseLoadingInsightCache(raw, now), null);
});

test("writeLoadingInsightCache persists the current session alongside fresh data", () => {
  const storage = createStorage();
  const now = new Date("2026-04-22T13:30:00.000Z");

  writeLoadingInsightCache(storage, payload, now);

  const raw = storage.getItem(AI_LOGIN_CACHE_KEY);
  assert.ok(raw);

  const parsed = JSON.parse(raw ?? "{}") as {
    data?: LoadingInsightResponse;
    timestamp?: number;
    session?: string;
  };
  assert.deepEqual(parsed.data, payload);
  assert.equal(parsed.timestamp, now.getTime());
  assert.equal(parsed.session, "ny");
});
