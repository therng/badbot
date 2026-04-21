"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EconomicEvent } from "@/app/api/economic-events/route";


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
const ENGINE_CACHE_KEY = "analytic_xau_v1_cache";
const ENGINE_CACHE_TTL_MS = 60 * 60 * 1000;

type SessionKey = "asia" | "london" | "ny" | "overnight";
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

function bangkokHour(date = new Date()) {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return Math.floor(((utcMinutes + 7 * 60) % (24 * 60)) / 60);
}

function resolveSession(hour: number): SessionKey {
  if (hour >= 7 && hour < 14) return "asia";
  if (hour >= 14 && hour < 20) return "london";
  if (hour >= 20 || hour < 2) return "ny";
  return "overnight";
}

function pickDeterministic<T>(list: T[], seed: number, salt: number) {
  const index = Math.abs(Math.floor(seed * 9301 + salt * 49297)) % list.length;
  return list[index];
}

const TREND_BANK: Record<SessionKey, string[][]> = {
  asia: [
    [
      "ฝั่งซื้อยังคุมจังหวะในกรอบเอเชีย",
      "สภาพคล่องใต้ฐานยังมีโอกาสถูกกวาด",
      "แรงขายเร่งตัวเมื่อหลุดฐานย่อย",
      "รอรับหลังเก็บ liquidity แล้วค่อยตาม",
    ],
    [
      "ทองยังยืนเหนือโครงสร้างพักตัวได้",
      "จุดซ่อนแรงคือฐานต่ำก่อนหน้า",
      "เสีย higher low แล้ว bias จะเปลี่ยน",
      "เน้น buy the dip มากกว่าราคาไล่",
    ],
  ],
  london: [
    [
      "ลอนดอนหนุนแรงซื้อเหนือกรอบสะสม",
      "liquidity ฝั่งบนยังเปิดทางต่อ",
      "โดน reject แรงตรงยอดคือสัญญาณเสี่ยง",
      "รอ retest แล้วค่อยตามฝั่งขึ้น",
    ],
    [
      "โมเมนตัมยุโรปยังพยุงฝั่งบวก",
      "โซน sweep ใต้ low ล่าสุดยังสำคัญ",
      "หลุดฐานลอนดอนเมื่อไรเกมเปลี่ยน",
      "เลือกเทรด continuation หลังย่อสวย",
    ],
  ],
  ny: [
    [
      "นิวยอร์กเปิดด้วยแรงตามซื้อชัด",
      "จุดซ่อนอยู่ที่การดูดซับฝั่งขาย",
      "DXY เด้งแรงจะกดทองทันที",
      "ถือ bias บวกจนกว่าจะเสียฐาน",
    ],
    [
      "กระแสหลักยังเอนเข้าฝั่งผู้ซื้อ",
      "liquidity เหนือยอดยังล่อราคาอยู่",
      "ข่าวสหรัฐพลิกจังหวะได้เร็วมาก",
      "ลดขนาดไม้ก่อนข่าวแล้วค่อยเติม",
    ],
  ],
  overnight: [
    [
      "ตลาดดึกยังสะสมกำลังก่อนเอเชีย",
      "โซนเก็บของอยู่ใต้ swing ล่าสุด",
      "หลุดฐานเงียบเมื่อไรฝั่งลงเร่งตัว",
      "รอ confirmation ก่อนเปิดไม้ใหม่",
    ],
    [
      "สภาพคล่องบางแต่โครงสร้างยังไม่เสีย",
      "แรงจริงซ่อนอยู่แถว demand เดิม",
      "เบรกหลอกช่วงดึกทำลายจังหวะง่าย",
      "เก็บไม้เบาและรอเช้าเพิ่มน้ำหนัก",
    ],
  ],
};

const FALLBACK_TRENDS = [
  "พร้อมสำหรับการสแกนโครงสร้างตลาด",
  "โฟกัส liquidity สำคัญก่อนเสมอ",
  "รักษา bias จนกว่าจะเสียฐาน",
  "เข้าเทรดเมื่อจังหวะยืนยันเท่านั้น",
];

function buildLocalTrends(now = new Date()) {
  const hour = bangkokHour(now);
  const session = resolveSession(hour);
  const rotation = Math.floor(now.getTime() / (10 * 60 * 1000));
  const jitter = (rotation % 997) / 997;

  return pickDeterministic(TREND_BANK[session], jitter, hour) ?? FALLBACK_TRENDS;
}

function readCachedTrends() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ENGINE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: unknown; timestamp?: unknown };
    if (!Array.isArray(parsed.data) || typeof parsed.timestamp !== "number") return null;
    if (Date.now() - parsed.timestamp >= ENGINE_CACHE_TTL_MS) return null;
    const trends = parsed.data.filter((line): line is string => typeof line === "string" && line.trim().length > 0).slice(0, 4);
    return trends.length === 4 ? trends : null;
  } catch {
    return null;
  }
}

function formatEventTime(time: string): string {
  if (!time) return "All Day";
  return time;
}

function useAnalyticEngine(): AnalyticEngineState {
  const [trends, setTrends] = useState<string[]>(() => readCachedTrends() ?? buildLocalTrends());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAiAnalysis = useCallback(async (force = false) => {
    const localTrends = !force ? (readCachedTrends() ?? buildLocalTrends()) : buildLocalTrends();
    setTrends(localTrends);
    setCurrentIndex(0);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          ENGINE_CACHE_KEY,
          JSON.stringify({
            data: trends,
            timestamp: Date.now(),
          }),
        );
      } catch {
        /* ignore */
      }
    }
  }, [trends]);

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

  const { trends, currentIndex, isLoading: loadingInsight, refresh } = useAnalyticEngine();

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
            <span className="ls__insight-label">AI-CORE</span>
            <button
              type="button"
              className="ls__insight-refresh"
              onClick={refresh}
              disabled={loadingInsight || isEntering}
              aria-label="Refresh AI-CORE insight"
            >
              ↻
            </button>
          </div>
          <p className="ls__insight-text">
            {loadingInsight && !insightTyped ? (
              <span className="ls__insight-loading">Loading AI-CORE…<span className="ls__blink">▌</span></span>
            ) : (
              <>{insightTyped}<span className="ls__caret" aria-hidden>{caret}</span></>
            )}
          </p>
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
          <span>Analytic 4.0, 2026 by Therng</span>
        </footer>
      </main>
    </div>
  );
}

export { readAuthenticatedFlag };
