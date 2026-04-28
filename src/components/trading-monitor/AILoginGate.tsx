"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getInitialAiLoginTrends,
  resolveAiLoginTrends,
} from "@/components/trading-monitor/ai-login-engine";

const STORAGE_KEY = "analytic.ai.session";
const TYPING_SPEED_MS = 18;
let inMemoryAuthenticated = false;

// ── Candlestick realtime chart ──────────────────────────────
const MAX_VISIBLE = 24;
const TICK_MS = 380;

type Candle = {
  key: number;
  bull: boolean;
  bodyH: number;   // % of chart height
  bodyB: number;   // bottom offset %
  wickTop: number;  // top of wick (absolute %)
  wickBot: number;  // bottom of wick (absolute %)
};

type PatternBar = {
  open: number;
  high: number;
  low: number;
  close: number;
};

type CandlePattern = {
  name: string;
  bars: PatternBar[];
};

const PRICE_MIN = 4;
const PRICE_MAX = 96;
const BODY_STRETCH = 1.4;

const CANDLE_PATTERNS: CandlePattern[] = [
  {
    name: "Bearish Engulfing",
    bars: [
      { open: -8, high: 4, low: -10, close: 2 },
      { open: 6, high: 8, low: -18, close: -16 },
    ],
  },
  {
    name: "Three White Soldiers",
    bars: [
      { open: -12, high: 3, low: -14, close: 0 },
      { open: -2, high: 12, low: -4, close: 10 },
      { open: 8, high: 22, low: 6, close: 20 },
    ],
  },
  {
    name: "Evening Star & Doji",
    bars: [
      { open: -14, high: 8, low: -16, close: 6 },
      { open: 11, high: 15, low: 8, close: 10 },
      { open: 5, high: 7, low: -18, close: -16 },
    ],
  },
  {
    name: "Piercing Line",
    bars: [
      { open: 9, high: 11, low: -11, close: -9 },
      { open: -13, high: 5, low: -16, close: 3 },
    ],
  },
  {
    name: "Meeting Lines - Bullish",
    bars: [
      { open: 10, high: 12, low: -12, close: -10 },
      { open: -22, high: -7, low: -24, close: -10 },
    ],
  },
  {
    name: "Dark Cloud Cover",
    bars: [
      { open: -10, high: 12, low: -12, close: 10 },
      { open: 16, high: 18, low: -5, close: -3 },
    ],
  },
  {
    name: "Three Black Crows",
    bars: [
      { open: 12, high: 14, low: -3, close: -1 },
      { open: 1, high: 3, low: -14, close: -12 },
      { open: -10, high: -8, low: -25, close: -23 },
    ],
  },
  {
    name: "Hammer",
    bars: [
      { open: 1, high: 5, low: -19, close: 3 },
    ],
  },
  {
    name: "Meeting Lines - Bearish",
    bars: [
      { open: -10, high: 12, low: -12, close: 10 },
      { open: 22, high: 24, low: 7, close: 10 },
    ],
  },
  {
    name: "Hanging Man",
    bars: [
      { open: 2, high: 5, low: -18, close: 0 },
    ],
  },
  {
    name: "Bullish Harami",
    bars: [
      { open: 10, high: 12, low: -12, close: -10 },
      { open: -5, high: 4, low: -7, close: 2 },
    ],
  },
  {
    name: "Morning Star & Doji",
    bars: [
      { open: 12, high: 14, low: -8, close: -6 },
      { open: -12, high: -8, low: -15, close: -11 },
      { open: -5, high: 18, low: -7, close: 16 },
    ],
  },
];

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toCandle(key: number, bar: PatternBar): { candle: Candle; close: number } {
  const open = clamp(bar.open, PRICE_MIN, PRICE_MAX);
  const close = clamp(bar.close, PRICE_MIN, PRICE_MAX);
  const high = clamp(Math.max(bar.high, open, close), PRICE_MIN, PRICE_MAX);
  const low = clamp(Math.min(bar.low, open, close), PRICE_MIN, PRICE_MAX);
  const bull = close >= open;
  const bodyBot = Math.min(open, close);
  const bodyTop = Math.max(open, close);
  const bodyH = Math.max(2.4, bodyTop - bodyBot);
  return {
    candle: { key, bull, bodyH, bodyB: bodyBot, wickTop: 100 - high, wickBot: low },
    close,
  };
}

function buildPatternBars(prevClose: number): PatternBar[] {
  const pattern = CANDLE_PATTERNS[Math.floor(Math.random() * CANDLE_PATTERNS.length)];
  const scale = randomBetween(0.55, 1.85);

  // Anchor first bar's open exactly to prevClose for price continuity
  const anchorOpen = clamp(prevClose, PRICE_MIN + 4, PRICE_MAX - 4);
  const firstPatternOpen = pattern.bars[0].open * scale;
  const shift = anchorOpen - firstPatternOpen;

  let shiftedBars = pattern.bars.map((bar) => ({
    open:  bar.open  * scale + shift,
    high:  bar.high  * scale + shift,
    low:   bar.low   * scale + shift,
    close: bar.close * scale + shift,
  }));

  // Chain bars within pattern: each bar opens at previous bar's close
  for (let i = 1; i < shiftedBars.length; i++) {
    const prevBarClose = shiftedBars[i - 1].close;
    const barShift = prevBarClose - shiftedBars[i].open;
    shiftedBars[i] = {
      open:  shiftedBars[i].open  + barShift,
      high:  shiftedBars[i].high  + barShift,
      low:   shiftedBars[i].low   + barShift,
      close: shiftedBars[i].close + barShift,
    };
  }

  shiftedBars = shiftedBars.map((bar) => {
    const bodySize = Math.abs(bar.close - bar.open);
    if (bodySize < 3) return bar;

    const bodyMid = (bar.open + bar.close) / 2;
    const open = bodyMid + (bar.open - bodyMid) * BODY_STRETCH;
    const close = bodyMid + (bar.close - bodyMid) * BODY_STRETCH;

    return {
      open,
      high: Math.max(bar.high, open, close),
      low:  Math.min(bar.low,  open, close),
      close,
    };
  });

  // Clamp entire pattern to price range without distorting shape
  const patternLow  = Math.min(...shiftedBars.map((b) => b.low));
  const patternHigh = Math.max(...shiftedBars.map((b) => b.high));
  const rangeShift =
    patternLow < PRICE_MIN
      ? PRICE_MIN - patternLow
      : patternHigh > PRICE_MAX
        ? PRICE_MAX - patternHigh
        : 0;

  if (rangeShift !== 0) {
    shiftedBars = shiftedBars.map((bar) => ({
      open:  bar.open  + rangeShift,
      high:  bar.high  + rangeShift,
      low:   bar.low   + rangeShift,
      close: bar.close + rangeShift,
    }));
  }

  return shiftedBars;
}

function nextPatternCandle(key: number, prevClose: number): { candle: Candle; close: number } {
  if (_patternQueue.length === 0) {
    _patternQueue = buildPatternBars(prevClose);
  }

  const nextBar = _patternQueue.shift();
  return toCandle(key, nextBar ?? buildPatternBars(prevClose)[0]);
}

// ── XAUUSD live data ────────────────────────────────────────
type RawCandle = { o: number; h: number; l: number; c: number };

// Normalize real OHLC prices into chart % coordinates
function normalizeCandles(raw: RawCandle[]): Candle[] {
  if (raw.length === 0) return [];
  const allPrices = raw.flatMap((c) => [c.o, c.h, c.l, c.c]);
  const priceMin = Math.min(...allPrices);
  const priceMax = Math.max(...allPrices);
  const range = priceMax - priceMin || 1;

  const toPercent = (p: number) =>
    clamp(((p - priceMin) / range) * (PRICE_MAX - PRICE_MIN) + PRICE_MIN, PRICE_MIN, PRICE_MAX);

  return raw.map((rc, i) => {
    const o = toPercent(rc.o);
    const c = toPercent(rc.c);
    const h = toPercent(rc.h);
    const l = toPercent(rc.l);
    const bull = c >= o;
    const bodyBot = Math.min(o, c);
    const bodyTop = Math.max(o, c);
    return {
      key: i,
      bull,
      bodyH: Math.max(1.2, bodyTop - bodyBot),
      bodyB: bodyBot,
      wickTop: 100 - h,
      wickBot: l,
    };
  });
}

// Module-scoped stream state — survives re-renders, avoids ref-in-initializer lint
let _streamKey = 0;
let _streamSeeded = false;
// Real XAUUSD candles used as the looping source; empty = fallback to random
let _realCandles: Candle[] = [];
let _realIndex = 0;
// Random-pattern fallback state
let _streamClose = 0;
let _patternQueue: PatternBar[] = [];

function seedFallback(): Candle[] {
  if (_streamSeeded) return [];
  _streamSeeded = true;
  _streamKey = 0;
  _streamClose = 40 + Math.random() * 20;
  _patternQueue = [];
  const out: Candle[] = [];
  for (let i = 0; i < MAX_VISIBLE; i++) {
    const r = nextPatternCandle(_streamKey++, _streamClose);
    out.push(r.candle);
    _streamClose = r.close;
  }
  return out;
}

function nextCandle(): Candle {
  if (_realCandles.length > 0) {
    // Loop through real data indefinitely
    const src = _realCandles[_realIndex % _realCandles.length];
    const candle: Candle = { ...src, key: _streamKey++ };
    _realIndex++;
    return candle;
  }
  // Fallback: random pattern
  const { candle, close } = nextPatternCandle(_streamKey++, _streamClose);
  _streamClose = close;
  return candle;
}

function useCandlestickStream() {
  const [candles, setCandles] = useState<Candle[]>([]);

  useEffect(() => {
    if (!_streamSeeded) {
      const initial = seedFallback();
      const t = window.setTimeout(() => { if (initial.length > 0) setCandles(initial); }, 0);
      void t;
    }

    let cancelled = false;
    fetch("/api/xauusd-candles", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        const raw: RawCandle[] = (payload?.candles ?? []).filter(
          (c: RawCandle) => c.o > 0 && c.h > 0 && c.l > 0 && c.c > 0,
        );
        if (raw.length < 4) return;

        _realCandles = normalizeCandles(raw);
        _realIndex = 0;
        _streamKey = 0;
        const initial = _realCandles.slice(0, MAX_VISIBLE).map((c, i) => ({ ...c, key: i }));
        _streamKey = initial.length;
        _realIndex = initial.length;
        setCandles(initial);
      })
      .catch(() => { /* keep fallback */ });

    const id = window.setInterval(() => {
      const candle = nextCandle();
      setCandles((prev) => {
        if (prev.length >= MAX_VISIBLE) {
          const next = prev.slice(1);
          next.push(candle);
          return next;
        }
        return [...prev, candle];
      });
    }, TICK_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return candles;
}

type Phase = "idle" | "entering";

type AILoginGateProps = {
  onEnter: () => void;
};

type AnalyticEngineState = {
  trends: string[];
  currentIndex: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

function getBrowserStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function readAuthenticatedFlag() {
  if (inMemoryAuthenticated) return true;
  const storage = getBrowserStorage("sessionStorage");
  if (!storage) return false;
  try {
    return storage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAuthenticatedFlag() {
  inMemoryAuthenticated = true;
  const storage = getBrowserStorage("sessionStorage");
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function useAnalyticEngine(): AnalyticEngineState {
  const [trends, setTrends] = useState<string[]>(() =>
    getInitialAiLoginTrends(getBrowserStorage("localStorage")),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAiAnalysis = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const nextTrends = await resolveAiLoginTrends({
        force,
        storage: getBrowserStorage("localStorage"),
        fetchImpl: fetch,
      });
      setTrends(nextTrends);
      setCurrentIndex(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAiAnalysis(false);
  }, [fetchAiAnalysis]);

  useEffect(() => {
    const rotateInterval = window.setInterval(() => {
      setCurrentIndex((prev) => trends.length > 0 ? (prev + 1) % trends.length : 0);
    }, 10000);
    return () => window.clearInterval(rotateInterval);
  }, [trends.length]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchAiAnalysis(true);
  }, [fetchAiAnalysis]);

  return { trends, currentIndex, isLoading, refresh };
}

export default function AILoginGate({ onEnter }: AILoginGateProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [insightTyped, setInsightTyped] = useState<string>("");
  const candles = useCandlestickStream();

  const { trends, currentIndex, isLoading: loadingInsight } = useAnalyticEngine();

  const insight = trends[currentIndex] ?? "";

  useEffect(() => {
    const reset = window.setTimeout(() => setInsightTyped(""), 0);
    if (!insight) return () => window.clearTimeout(reset);
    let index = 0;
    const handle = window.setInterval(() => {
      index += 1;
      setInsightTyped(insight.slice(0, index));
      if (index >= insight.length) window.clearInterval(handle);
    }, TYPING_SPEED_MS);
    return () => {
      window.clearTimeout(reset);
      window.clearInterval(handle);
    };
  }, [insight]);

  const handleEnter = useCallback(() => {
    if (phase === "entering") return;
    setPhase("entering");
    writeAuthenticatedFlag();
    window.setTimeout(onEnter, 420);
  }, [onEnter, phase]);

  const handleShellKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleEnter();
      }
    },
    [handleEnter],
  );

  // Lock launch screen: no scroll, no pinch-to-zoom
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("touchmove", prevent, { passive: false });
    return () => document.removeEventListener("touchmove", prevent);
  }, []);

  const caret = insightTyped.length < insight.length ? "▍" : "";
  const statusLine = insightTyped || insight || "Initializing Ai-Core...";

  return (
    <div className="ls" data-phase={phase} role="dialog" aria-label="Analytic — Launch">
      <div className="ls__bg" aria-hidden />
      <div className="ls__scanline" aria-hidden />
      <div className="ls__vignette" aria-hidden />

      <main
        className="ls__shell"
        onClick={handleEnter}
        onKeyDown={handleShellKeyDown}
        tabIndex={0}
      >
        <section className="ls__hero" aria-label="Analytic launch sequence">
          <div className="ls__data-side" aria-hidden>
            <div className="ls__market-panel">
              <div className="ls__chart-frame">
                <div className="ls__chart">
                  <div className="ls__chart-depth" aria-hidden />
                  <span className="ls__chart-axis-y" />
                  <span className="ls__chart-axis-x" />
                  <div className="ls__candles">
                    {candles.map((c) => (
                      <span
                        key={c.key}
                        className={`ls__candle ${c.bull ? "ls__candle--bull" : "ls__candle--bear"}`}
                        style={{
                          "--body-h": `${c.bodyH}%`,
                          "--body-b": `${c.bodyB}%`,
                          "--wick-top": `${c.wickTop}%`,
                          "--wick-bot": `${c.wickBot}%`,
                        } as React.CSSProperties}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="ls__brand-side">
            <div className="ls__brand">
              <h1 className="ls__wordmark" aria-label="ANALYTIC">
                <span className="ls__wordmark-main">ANALYT</span>
                <span className="ls__wordmark-i">
                  I
                  <span className="ls__wordmark-dot" aria-hidden />
                </span>
                <span className="ls__wordmark-main">C</span>
              </h1>
            </div>

            <div className="ls__insight">
              <div className="ls__module-row">
                <span className="ls__module-text">AI-Core</span>
              </div>

              <p className="ls__quote" aria-live="polite">
                <span className="ls__quote-mark">&quot;</span>
                <span className="ls__quote-text">
                  {loadingInsight && !insightTyped ? "Initializing Ai-Core..." : statusLine}
                </span>
                <span className="ls__caret" aria-hidden>
                  {caret}
                </span>
                <span className="ls__quote-mark">&quot;</span>
              </p>

              <div className="ls__progress-wrap" aria-hidden>
                <div className="ls__progress" />
              </div>

              <button
                type="button"
                className="ls__enter"
                onClick={(event) => {
                  event.stopPropagation();
                  handleEnter();
                }}
                disabled={phase === "entering"}
              >
                แตะเพื่อเข้า
              </button>
            </div>
          </div>
        </section>

        <footer className="ls__footer">
          Analytic v5.0 by Therng
        </footer>
      </main>
    </div>
  );
}

export { readAuthenticatedFlag };
