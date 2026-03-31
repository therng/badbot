import type { AccountOverviewResponse, SerializedAccount, Timeframe } from "./types";

const rawBase = process.env.EXPO_PUBLIC_API_BASE_URL || "";
const API_BASE = rawBase.replace(/\/$/, "");

function getBaseUrl() {
  if (!API_BASE) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
  }
  return API_BASE;
}

async function fetchJson<T>(path: string): Promise<T> {
  const base = getBaseUrl();
  const response = await fetch(`${base}${path}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }
  return (await response.json()) as T;
}

export async function getAccounts(): Promise<SerializedAccount[]> {
  return fetchJson<SerializedAccount[]>("/api/accounts");
}

export async function getAccountOverview(accountId: string, timeframe: Timeframe): Promise<AccountOverviewResponse> {
  return fetchJson<AccountOverviewResponse>(`/api/accounts/${accountId}?timeframe=${timeframe}`);
}
