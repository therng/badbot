import assert from "node:assert/strict";
import test from "node:test";

import type { LoadingInsightResponse } from "@/app/api/loading-insight/route";

import { AI_LOGIN_CACHE_KEY } from "./ai-login-cache";
import {
  FALLBACK_TRENDS,
  getInitialAiLoginTrends,
  mapLoadingInsightsToTrends,
  resolveAiLoginTrends,
} from "./ai-login-engine";

const payload: LoadingInsightResponse = {
  insights: [
    "trend",
    "liquidity",
    "risk",
    "strategy",
    "news",
    "price action",
  ],
  source: "gemini",
};

function createStorage(initialValue?: string) {
  const state = new Map<string, string>();
  if (initialValue) {
    state.set(AI_LOGIN_CACHE_KEY, initialValue);
  }

  return {
    getItem(key: string) {
      return state.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

test("mapLoadingInsightsToTrends keeps the first four launch-screen insights", () => {
  assert.deepEqual(mapLoadingInsightsToTrends(payload), ["trend", "liquidity", "risk", "strategy"]);
});

test("getInitialAiLoginTrends uses a valid cache before local fallback", () => {
  const now = new Date("2026-04-22T01:00:00.000Z");
  const storage = createStorage(
    JSON.stringify({
      data: payload,
      timestamp: now.getTime() - 60_000,
      session: "asia",
    }),
  );

  assert.deepEqual(getInitialAiLoginTrends(storage, now), ["trend", "liquidity", "risk", "strategy"]);
});

test("resolveAiLoginTrends fetches and persists fresh insights on cache miss", async () => {
  const now = new Date("2026-04-22T01:00:00.000Z");
  const storage = createStorage();

  const trends = await resolveAiLoginTrends({
    storage,
    now,
    fetchImpl: async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

  assert.deepEqual(trends, ["trend", "liquidity", "risk", "strategy"]);

  const raw = storage.getItem(AI_LOGIN_CACHE_KEY);
  assert.ok(raw);
  const parsed = JSON.parse(raw ?? "{}") as { data?: LoadingInsightResponse };
  assert.deepEqual(parsed.data, payload);
});

test("resolveAiLoginTrends falls back to cache when the endpoint request fails", async () => {
  const now = new Date("2026-04-22T01:00:00.000Z");
  const storage = createStorage(
    JSON.stringify({
      data: payload,
      timestamp: now.getTime() - 60_000,
      session: "asia",
    }),
  );

  const trends = await resolveAiLoginTrends({
    force: true,
    storage,
    now,
    fetchImpl: async () => {
      throw new Error("network");
    },
  });

  assert.deepEqual(trends, ["trend", "liquidity", "risk", "strategy"]);
});

test("resolveAiLoginTrends falls back to local trends when there is no cache and fetch fails", async () => {
  const now = new Date("2026-04-22T01:00:00.000Z");

  const trends = await resolveAiLoginTrends({
    storage: createStorage(),
    now,
    fetchImpl: async () => {
      throw new Error("network");
    },
  });

  assert.equal(trends.length, 4);
  assert.notDeepEqual(trends, ["trend", "liquidity", "risk", "strategy"]);
  assert.notDeepEqual(trends, FALLBACK_TRENDS);
});
