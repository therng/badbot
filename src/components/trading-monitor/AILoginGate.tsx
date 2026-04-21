"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EconomicEvent } from "@/app/api/economic-events/route";


type InsightSource = "gemini" | "local" | "fallback";

type InsightResponse = {
  insight: string;
  source: InsightSource;
};

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
const APP_VERSION = "v4.0";

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

function sourceLabel(source: InsightSource | null) {
  switch (source) {
    case "gemini": return "Gemini AI";
    case "local": return "Local Composer";
    case "fallback": return "Standby";
    default: return "Booting…";
  }
}

function formatEventTime(time: string): string {
  if (!time) return "All Day";
  return time;
}

export default function AILoginGate({ onEnter }: AILoginGateProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [insight, setInsight] = useState<string>("");
  const [insightTyped, setInsightTyped] = useState<string>("");
  const [insightSource, setInsightSource] = useState<InsightSource | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(true);
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch AI Insight ──────────────────────────────────────────
  const fetchInsight = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingInsight(true);
    try {
      const res = await fetch("/api/loading-insight", { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const payload = (await res.json()) as InsightResponse;
      setInsight(payload.insight ?? "");
      setInsightSource(payload.source ?? "fallback");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setInsight("พร้อมสำหรับการวิเคราะห์ข้อมูลขั้นสูง");
      setInsightSource("fallback");
    } finally {
      setLoadingInsight(false);
    }
  }, []);

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
    fetchInsight();
    fetchEvents();
    return () => { abortRef.current?.abort(); };
  }, [fetchInsight, fetchEvents]);

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

  const todayLabel = useMemo(() => {
    const now = new Date();
    const bangkokMs = now.getTime() + 7 * 60 * 60 * 1000;
    const d = new Date(bangkokMs);
    return d.toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  }, []);

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
          <h1 className="ls__wordmark">ANALYTIC</h1>
        </section>

        {/* ── AI Core Insight ── */}
        <section className="ls__insight" aria-live="polite">
          <div className="ls__insight-header">
            <span className="ls__insight-label">AI CORE INSIGHT</span>
            <span className="ls__insight-source">{sourceLabel(insightSource)}</span>
          </div>
          <p className="ls__insight-text">
            {loadingInsight && !insightTyped ? (
              <span className="ls__insight-loading">Synthesizing…<span className="ls__blink">▌</span></span>
            ) : (
              <>{insightTyped}<span className="ls__caret" aria-hidden>{caret}</span></>
            )}
          </p>
          <button
            type="button"
            className="ls__insight-refresh"
            onClick={fetchInsight}
            disabled={loadingInsight || isEntering}
            aria-label="Regenerate insight"
          >
            ↻
          </button>
        </section>

        {/* ── Economic Events ── */}
        <section className="ls__events" aria-label="Today's USD economic events">
          <div className="ls__events-header">
            <span className="ls__events-label">USD EVENTS</span>
            <span className="ls__events-date">{todayLabel}</span>
          </div>
          <div className="ls__events-list">
            {loadingEvents ? (
              <div className="ls__events-loading">
                <span className="ls__events-dot ls__events-dot--pulse" />
                <span className="ls__events-loading-text">Loading calendar…</span>
              </div>
            ) : events.length === 0 ? (
              <div className="ls__events-empty">No high-impact USD events today</div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="ls__event" data-holiday={ev.impact === "Holiday" ? "1" : "0"}>
                  <span className="ls__event-time">{ev.impact === "Holiday" ? "—" : formatEventTime(ev.time)}</span>
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

        {/* ── Enter button ── */}
        <button
          type="button"
          className="ls__enter"
          onClick={handleEnter}
          disabled={isEntering}
        >
          {isEntering ? (
            <span className="ls__enter-text">Entering…</span>
          ) : (
            <>
              <span className="ls__enter-text">TAP TO ENTER</span>
              <span className="ls__enter-arrow" aria-hidden>→</span>
            </>
          )}
        </button>

        {/* ── Footer ── */}
        <footer className="ls__footer">
          <span className="ls__footer-version">{APP_VERSION}</span>
          <span className="ls__footer-sep" aria-hidden>·</span>
          <span>Bangkok UTC+7</span>
          <span className="ls__footer-sep" aria-hidden>·</span>
          <span>AI Core</span>
        </footer>
      </main>
    </div>
  );
}

export { readAuthenticatedFlag };
