import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type XauCandle = {
  t: number;   // unix timestamp (seconds)
  o: number;
  h: number;
  l: number;
  c: number;
};

export type XauCandlesResponse = {
  candles: XauCandle[];
  source: "yahoo" | "fallback";
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const BAR_LIMIT = 115;
const LOOKBACK_DAYS = 14;
type Cache = { data: XauCandlesResponse; at: number };
let _cache: Cache | null = null;

async function fetchYahooCandles(): Promise<XauCandle[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - LOOKBACK_DAYS * 24 * 60 * 60;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF` +
    `?interval=1h&period1=${from}&period2=${now}&includePrePost=false`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) throw new Error(`yahoo ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0] ?? {};
  const opens: number[]  = q.open  ?? [];
  const highs: number[]  = q.high  ?? [];
  const lows: number[]   = q.low   ?? [];
  const closes: number[] = q.close ?? [];

  if (timestamps.length === 0) throw new Error("empty yahoo response");

  return timestamps
    .map((t, i) => ({
      t,
      o: opens[i],
      h: highs[i],
      l: lows[i],
      c: closes[i],
    }))
    .filter((c) => c.o != null && c.h != null && c.l != null && c.c != null)
    .slice(-BAR_LIMIT);
}

export async function GET() {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) {
    return NextResponse.json(_cache.data);
  }

  try {
    const candles = await fetchYahooCandles();
    const data: XauCandlesResponse = { candles, source: "yahoo" };
    _cache = { data, at: Date.now() };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ candles: [], source: "fallback" } satisfies XauCandlesResponse);
  }
}
