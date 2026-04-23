import type { LoadingInsightResponse } from "@/app/api/loading-insight/route";
import { resolveMarketSession, type SessionKey } from "@/lib/time";

export const AI_LOGIN_CACHE_KEY = "analytic_neural_v6_cache";
export const AI_LOGIN_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export type LoadingInsightCachePayload = {
  data: LoadingInsightResponse;
  timestamp: number;
  session: SessionKey;
};

function isValidLoadingInsightResponse(value: unknown): value is LoadingInsightResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as LoadingInsightResponse;
  return Array.isArray(candidate.insights) && candidate.insights.length >= 6;
}

export function parseLoadingInsightCache(raw: string | null, now = new Date()): LoadingInsightResponse | null {
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as Partial<LoadingInsightCachePayload>;
    if (typeof payload.timestamp !== "number") {
      return null;
    }

    if (now.getTime() - payload.timestamp >= AI_LOGIN_CACHE_TTL_MS) {
      return null;
    }

    if (payload.session !== resolveMarketSession(now)) {
      return null;
    }

    return isValidLoadingInsightResponse(payload.data) ? payload.data : null;
  } catch {
    return null;
  }
}

export function serializeLoadingInsightCache(
  data: LoadingInsightResponse,
  now = new Date(),
): LoadingInsightCachePayload {
  return {
    data,
    timestamp: now.getTime(),
    session: resolveMarketSession(now),
  };
}

export function readLoadingInsightCache(
  storage: StorageReader | null | undefined,
  now = new Date(),
): LoadingInsightResponse | null {
  if (!storage) {
    return null;
  }

  return parseLoadingInsightCache(storage.getItem(AI_LOGIN_CACHE_KEY), now);
}

export function writeLoadingInsightCache(
  storage: StorageWriter | null | undefined,
  data: LoadingInsightResponse,
  now = new Date(),
) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(AI_LOGIN_CACHE_KEY, JSON.stringify(serializeLoadingInsightCache(data, now)));
  } catch {
    // ignore localStorage write failures
  }
}
