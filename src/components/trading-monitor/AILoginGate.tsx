"use client";

import { useCallback, useEffect, useState } from "react";
import type { EconomicEvent } from "@/app/api/economic-events/route";
import {
  getInitialAiLoginTrends,
  resolveAiLoginTrends,
} from "@/components/trading-monitor/ai-login-engine";

const APP_VERSION = "4.1";

type EconomicEventsResponse = {
  events: EconomicEvent[];
  date: string;
};

type Phase = "idle" | "entering";

type AILoginGateProps = {
  onEnter: () => void;
};

const STORAGE_KEY = "analytic.ai.session";
const TYPING_SPEED_MS = 20;

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
    typeof window === "undefined" ? getInitialAiLoginTrends(null) : getInitialAiLoginTrends(window.localStorage),
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

export default function AILoginGate({ onEnter }: AILoginGateProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [insightTyped, setInsightTyped] = useState<string>("");
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const { trends, currentIndex, isLoading: loadingInsight } = useAnalyticEngine();

  // ── Fetch Economic Events ─────────────────────────────────────
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

  // ── Typewriter effect ─────────────────────────────────────────
  useEffect(() => {
    if (!insight) { setInsightTyped(""); return; }
    setInsightTyped("");
    let index = 0;
    const handle = window.setInterval(() => {
      index += 1;
      setInsightTyped(insight.slice(0, index));
      if (index >= insight.length) window.clearInterval(handle);
    }, TYPING_SPEED_MS);
    return () => window.clearInterval(handle);
  }, [insight]);

  // ── Enter handler ─────────────────────────────────────────────
  const handleEnter = useCallback(() => {
    if (phase === "entering") return;
    setPhase("entering");
    writeAuthenticatedFlag();
    window.setTimeout(onEnter, 480);
  }, [onEnter, phase]);

  const caret = insightTyped.length < insight.length ? "▌" : "";
  const isEntering = phase === "entering";

  return (
    <div className="ls" data-phase={phase} role="dialog" aria-label="Analytic Launch Screen">
      {/* ── Background layers ── */}
      <div className="ls__bg" aria-hidden />
      <div className="ls__scanline" aria-hidden />

      {/* ── Main shell ── */}
      <main className="ls__shell">

        {/* ── Logo zone ── */}
        <section className="ls__logo-zone" aria-hidden>
          <div className="ls__logo">
            {/* Sonar pulses */}
            <span className="ls__sonar ls__sonar--1" />
            <span className="ls__sonar ls__sonar--2" />
            <span className="ls__sonar ls__sonar--3" />
            {/* Rings */}
            <span className="ls__ring ls__ring--outer" />
            <span className="ls__ring ls__ring--mid" />
            <span className="ls__ring ls__ring--inner" />
            {/* Radar sweep */}
            <span className="ls__radar" />
            {/* Core */}
            <span className="ls__core" />
            <span className="ls__core-glow" />
          </div>
          <h1 className="ls__wordmark">Analytic</h1>
        </section>

        {/* ── Content area — AI + Events side by side on desktop ── */}
        <div className="ls__content">
          {/* ── AI Core Insight ── */}
          <section className="ls__insight" aria-live="polite">
            <div className="ls__section-header">
              <span className="ls__section-tag">AI-Core</span>
              <span className="ls__section-dot" />
            </div>
            <div className="ls__insight-body">
              {loadingInsight && !insightTyped ? (
                <span className="ls__insight-loading">กำลังประมวลผล<span className="ls__blink">▌</span></span>
              ) : (
                <p className="ls__insight-text">
                  {insightTyped}
                  <span className="ls__caret" aria-hidden>{caret}</span>
                </p>
              )}
            </div>
          </section>

          {/* ── Economic Events ── */}
          <section className="ls__events" aria-label="USD economic events">
            <div className="ls__section-header">
              <span className="ls__section-tag">Up Next</span>
              <span className="ls__section-badge">HIGH IMPACT</span>
            </div>
            <div className="ls__events-list">
              {loadingEvents ? (
                <div className="ls__events-loading">
                  <span className="ls__events-dot ls__events-dot--pulse" />
                  <span className="ls__events-loading-text">Loading calendar…</span>
                </div>
              ) : events.length === 0 ? (
                <div className="ls__events-empty">No high-impact USD events scheduled</div>
              ) : (
                events.map((ev) => (
                  <div key={ev.id} className="ls__event" data-holiday={ev.impact === "Holiday" ? "1" : "0"}>
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
                      <span className="ls__event-badge ls__event-badge--holiday">HOLIDAY</span>
                    ) : (
                      <span className="ls__event-badge ls__event-badge--high">HIGH</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* ── Enter button ── */}
        <button
          type="button"
          className="ls__enter"
          onClick={handleEnter}
          disabled={isEntering}
        >
          <span className="ls__enter-edge ls__enter-edge--l" aria-hidden />
          {isEntering ? (
            <span className="ls__enter-text">Initializing…</span>
          ) : (
            <>
              <span className="ls__enter-text">Enter Dashboard</span>
              <span className="ls__enter-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M7.5 4.5L12 9L7.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 9H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
            </>
          )}
          <span className="ls__enter-edge ls__enter-edge--r" aria-hidden />
          <span className="ls__enter-glow" aria-hidden />
        </button>

        {/* ── Footer ── */}
        <footer className="ls__footer">
          Analytic {APP_VERSION} by Therng
        </footer>
      </main>
    </div>
  );
}

export { readAuthenticatedFlag };
