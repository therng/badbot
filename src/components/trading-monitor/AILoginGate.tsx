"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EconomicEvent } from "@/app/api/economic-events/route";
import {
  getInitialAiLoginTrends,
  resolveAiLoginTrends,
} from "@/components/trading-monitor/ai-login-engine";

const APP_VERSION = "5.0";
const STORAGE_KEY = "analytic.ai.session";
const TYPING_SPEED_MS = 18;

type EconomicEventsResponse = {
  events: EconomicEvent[];
  date: string;
};

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

function readAuthenticatedFlag() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAuthenticatedFlag() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function useAnalyticEngine(): AnalyticEngineState {
  const [trends, setTrends] = useState<string[]>(() =>
    typeof window === "undefined"
      ? getInitialAiLoginTrends(null)
      : getInitialAiLoginTrends(window.localStorage),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAiAnalysis = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const nextTrends = await resolveAiLoginTrends({
        force,
        storage: typeof window === "undefined" ? null : window.localStorage,
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
      setCurrentIndex((prev) => (prev + 1) % trends.length);
    }, 10000);
    return () => window.clearInterval(rotateInterval);
  }, [trends.length]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchAiAnalysis(true);
  }, [fetchAiAnalysis]);

  return { trends, currentIndex, isLoading, refresh };
}

function useLocalClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 1000);
    const raf = window.requestAnimationFrame(tick);
    return () => {
      window.clearInterval(id);
      window.cancelAnimationFrame(raf);
    };
  }, []);
  return now;
}

function formatClock(now: Date | null) {
  if (!now) return "—— : ——";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Bangkok",
    }).format(now);
  } catch {
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
}

function formatDateLabel(now: Date | null) {
  if (!now) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      timeZone: "Asia/Bangkok",
    })
      .format(now)
      .toUpperCase();
  } catch {
    return "";
  }
}

export default function AILoginGate({ onEnter }: AILoginGateProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [insightTyped, setInsightTyped] = useState<string>("");
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const { trends, currentIndex, isLoading: loadingInsight } = useAnalyticEngine();
  const now = useLocalClock();

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/economic-events", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const payload = (await res.json()) as EconomicEventsResponse;
      setEvents(payload.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const insight = trends[currentIndex] ?? "";

  useEffect(() => {
    if (!insight) {
      setInsightTyped("");
      return;
    }
    setInsightTyped("");
    let index = 0;
    const handle = window.setInterval(() => {
      index += 1;
      setInsightTyped(insight.slice(0, index));
      if (index >= insight.length) window.clearInterval(handle);
    }, TYPING_SPEED_MS);
    return () => window.clearInterval(handle);
  }, [insight]);

  const handleEnter = useCallback(() => {
    if (phase === "entering") return;
    setPhase("entering");
    writeAuthenticatedFlag();
    window.setTimeout(onEnter, 420);
  }, [onEnter, phase]);

  const caret = insightTyped.length < insight.length ? "▍" : "";
  const isEntering = phase === "entering";

  const clockStr = useMemo(() => formatClock(now), [now]);
  const dateStr = useMemo(() => formatDateLabel(now), [now]);

  const topEvents = events.slice(0, 3);

  return (
    <div className="ls" data-phase={phase} role="dialog" aria-label="Analytic — Launch">
      <div className="ls__bg" aria-hidden />
      <div className="ls__scanline" aria-hidden />

      <main className="ls__shell">
        {/* ── Top bar ── */}
        <header className="ls__topbar">
          <div className="ls__runmark">
            <span className="ls__runmark-dot" aria-hidden />
            <span>Analytic · Operations Deck</span>
          </div>
          <div className="ls__topbar-right">
            <span>{dateStr || "———"}</span>
            <span className="ls__topbar-sep" aria-hidden />
            <span>{clockStr} BKK</span>
          </div>
        </header>

        {/* ── Stage: eyebrow + wordmark + signature chart ── */}
        <section className="ls__stage" aria-hidden>
          <span className="ls__eyebrow">A Quiet Ledger for Trading Operators</span>

          <h1 className="ls__wordmark">
            Analytic<em>.</em>
          </h1>

          <div className="ls__chart" aria-hidden>
            {/* L-axis (graphite) — drawn from logo */}
            <span className="ls__chart-axis-y" />
            <span className="ls__chart-axis-x" />

            {/* Axis ticks */}
            <span
              className="ls__chart-tick ls__chart-tick--x"
              style={{ left: "26%" }}
            />
            <span
              className="ls__chart-tick ls__chart-tick--x"
              style={{ left: "48%" }}
            />
            <span
              className="ls__chart-tick ls__chart-tick--x"
              style={{ left: "70%" }}
            />
            <span
              className="ls__chart-tick ls__chart-tick--y"
              style={{ top: "22%" }}
            />
            <span
              className="ls__chart-tick ls__chart-tick--y"
              style={{ top: "54%" }}
            />

            {/* Polyline — matches logo cadence: rise · small dip · rise */}
            <svg
              className="ls__chart-svg"
              viewBox="0 0 800 350"
              preserveAspectRatio="none"
              aria-hidden
            >
              <polyline
                className="ls__chart-line"
                points="120,240 300,130 500,200 700,80"
              />
              <circle className="ls__chart-node ls__chart-node--1" cx="120" cy="240" r="12" />
              <circle className="ls__chart-node ls__chart-node--2" cx="300" cy="130" r="12" />
              <circle className="ls__chart-node ls__chart-node--3" cx="500" cy="200" r="12" />
              <circle className="ls__chart-node ls__chart-node--4" cx="700" cy="80" r="12" />
            </svg>
          </div>
        </section>

        {/* ── Meta row: insight + events ── */}
        <section className="ls__meta">
          <article className="ls__card" aria-live="polite">
            <div className="ls__card-header">
              <span className="ls__card-tag">
                <span className="ls__card-tag-dot" aria-hidden />
                Today · AI Reading
              </span>
              <span className="ls__card-spacer" />
              <span className="ls__card-subtag">Refreshed</span>
            </div>
            {loadingInsight && !insightTyped ? (
              <span className="ls__insight-loading">
                กำลังประมวลผล<span className="ls__blink">▍</span>
              </span>
            ) : (
              <p className="ls__insight-text">
                {insightTyped}
                <span className="ls__caret" aria-hidden>
                  {caret}
                </span>
              </p>
            )}
          </article>

          <article className="ls__card" aria-label="USD high impact calendar">
            <div className="ls__card-header">
              <span className="ls__card-tag">
                <span className="ls__card-tag-dot" aria-hidden />
                Calendar · USD
              </span>
              <span className="ls__card-spacer" />
              <span className="ls__card-subtag">High Impact</span>
            </div>
            <div className="ls__events-list">
              {loadingEvents ? (
                <div className="ls__events-loading">
                  <span className="ls__events-dot ls__events-dot--pulse" aria-hidden />
                  <span>Loading calendar…</span>
                </div>
              ) : topEvents.length === 0 ? (
                <div className="ls__events-empty">No high-impact USD events scheduled</div>
              ) : (
                topEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="ls__event"
                    data-holiday={ev.impact === "Holiday" ? "1" : "0"}
                  >
                    <div className="ls__event-left">
                      {ev.impact === "Holiday" ? (
                        <span className="ls__event-time ls__event-time--holiday">—</span>
                      ) : (
                        <span className="ls__event-time">{ev.time || "All Day"}</span>
                      )}
                      <span className="ls__event-date">{ev.dateLabel}</span>
                    </div>
                    <span className="ls__event-name">{ev.name}</span>
                    {ev.impact === "Holiday" ? (
                      <span className="ls__event-badge ls__event-badge--holiday">Holiday</span>
                    ) : (
                      <span className="ls__event-badge ls__event-badge--high">High</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        {/* ── Footer row: progress · enter · signature ── */}
        <footer className="ls__footer-row">
          <div className="ls__footer-label">
            <div className="ls__progress" aria-hidden />
          </div>

          <button
            type="button"
            className="ls__enter"
            onClick={handleEnter}
            disabled={isEntering}
          >
            <span className="ls__enter-text">
              {isEntering ? "Opening…" : "Enter Dashboard"}
            </span>
            <span className="ls__enter-icon" aria-hidden>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6h7M6 2.5L9.5 6 6 9.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          <div className="ls__footer-label ls__footer-label--right">
            v{APP_VERSION} · by Therng
          </div>
        </footer>
      </main>
    </div>
  );
}

export { readAuthenticatedFlag };
