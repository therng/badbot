"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type InsightSource = "gemini" | "local" | "fallback";

type InsightResponse = {
  insight: string;
  source: InsightSource;
};

type Phase = "idle" | "authenticating" | "ready" | "entering";

type AILoginGateProps = {
  onEnter: () => void;
};

const ACCESS_CODE = "ANALYTIC";
const TYPING_SPEED_MS = 22;
const STORAGE_KEY = "analytic.ai.session";

const STATUS_CYCLES = [
  "Calibrating market model",
  "Reading liquidity signature",
  "Synthesizing XAUUSD context",
  "Aligning Bangkok session window",
  "Stabilizing insight channel",
];

function readAuthenticatedFlag() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAuthenticatedFlag() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore storage failures */
  }
}

function sourceLabel(source: InsightSource | null) {
  switch (source) {
    case "gemini":
      return "AI · Gemini";
    case "local":
      return "AI · Local Composer";
    case "fallback":
      return "AI · Standby";
    default:
      return "AI · Booting";
  }
}

export default function AILoginGate({ onEnter }: AILoginGateProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<string>("");
  const [insightTyped, setInsightTyped] = useState<string>("");
  const [insightSource, setInsightSource] = useState<InsightSource | null>(null);
  const [statusIndex, setStatusIndex] = useState(0);
  const [loadingInsight, setLoadingInsight] = useState(true);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchInsight = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingInsight(true);
    try {
      const response = await fetch("/api/loading-insight", {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const payload = (await response.json()) as InsightResponse;
      setInsight(payload.insight ?? "");
      setInsightSource(payload.source ?? "fallback");
    } catch (fetchError) {
      if ((fetchError as Error).name === "AbortError") {
        return;
      }
      setInsight("พร้อมสำหรับการวิเคราะห์ข้อมูลขั้นสูง");
      setInsightSource("fallback");
    } finally {
      setLoadingInsight(false);
    }
  }, []);

  useEffect(() => {
    fetchInsight();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchInsight]);

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
      if (index >= insight.length) {
        window.clearInterval(handle);
      }
    }, TYPING_SPEED_MS);
    return () => window.clearInterval(handle);
  }, [insight]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      setStatusIndex((current) => (current + 1) % STATUS_CYCLES.length);
    }, 2200);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (phase === "authenticating" || phase === "entering") return;

      const normalized = code.trim().toUpperCase();
      if (!normalized) {
        setError("กรุณาป้อนรหัสเข้าระบบ");
        return;
      }

      if (normalized !== ACCESS_CODE) {
        setError("รหัสไม่ถูกต้อง ลองอีกครั้ง");
        return;
      }

      setError(null);
      setPhase("authenticating");

      window.setTimeout(() => {
        setPhase("ready");
        window.setTimeout(() => {
          setPhase("entering");
          writeAuthenticatedFlag();
          onEnter();
        }, 420);
      }, 720);
    },
    [code, onEnter, phase],
  );

  const handleGuest = useCallback(() => {
    if (phase === "authenticating" || phase === "entering") return;
    setError(null);
    setPhase("ready");
    writeAuthenticatedFlag();
    window.setTimeout(() => {
      setPhase("entering");
      onEnter();
    }, 220);
  }, [onEnter, phase]);

  const caret = insightTyped.length < insight.length ? "▌" : "";

  const statusLine = useMemo(() => {
    if (phase === "authenticating") return "Verifying credentials…";
    if (phase === "ready" || phase === "entering") return "Access granted — syncing dashboard";
    return STATUS_CYCLES[statusIndex];
  }, [phase, statusIndex]);

  const buttonLabel = useMemo(() => {
    if (phase === "authenticating") return "Authenticating";
    if (phase === "ready" || phase === "entering") return "Entering";
    return "Enter Analytic";
  }, [phase]);

  const isBusy = phase === "authenticating" || phase === "entering";

  return (
    <div className="ai-login" data-phase={phase} role="dialog" aria-label="Analytic AI Access">
      <div className="ai-login__stage" aria-hidden />
      <div className="ai-login__glow" aria-hidden />
      <div className="ai-login__scanline" aria-hidden />

      <main className="ai-login__shell">
        <header className="ai-login__header">
          <div className="ai-login__brand">
            <span className="ai-login__mark" aria-hidden>
              <span className="ai-login__mark-core" />
              <span className="ai-login__mark-ring" />
            </span>
            <div className="ai-login__brand-text">
              <span className="ai-login__wordmark">ANALYTIC</span>
              <span className="ai-login__subwordmark">AI Trading Intelligence · XAUUSD</span>
            </div>
          </div>

          <div className="ai-login__status" data-busy={isBusy ? "1" : "0"}>
            <span className="ai-login__pulse" aria-hidden />
            <span className="ai-login__status-text">{statusLine}</span>
          </div>
        </header>

        <section className="ai-login__insight" aria-live="polite">
          <div className="ai-login__insight-head">
            <span className="ai-login__insight-label">AI MARKET INSIGHT</span>
            <span className="ai-login__insight-source">{sourceLabel(insightSource)}</span>
          </div>
          <p className="ai-login__insight-text">
            {loadingInsight && !insightTyped ? (
              <span className="ai-login__insight-skeleton">Synthesizing insight…</span>
            ) : (
              <>
                {insightTyped}
                <span className="ai-login__caret" aria-hidden>
                  {caret}
                </span>
              </>
            )}
          </p>
          <button
            type="button"
            className="ai-login__refresh"
            onClick={fetchInsight}
            disabled={loadingInsight || isBusy}
          >
            <span aria-hidden>↻</span>
            <span>Regenerate</span>
          </button>
        </section>

        <form className="ai-login__form" onSubmit={handleSubmit}>
          <label className="ai-login__field" htmlFor="ai-login-code">
            <span className="ai-login__field-label">ACCESS CODE</span>
            <input
              id="ai-login-code"
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (error) setError(null);
              }}
              placeholder="ANALYTIC"
              disabled={isBusy}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "ai-login-error" : undefined}
            />
            <span className="ai-login__field-hint">
              ใช้รหัส <code>ANALYTIC</code> หรือเข้าระบบในโหมด Guest
            </span>
          </label>

          {error ? (
            <p id="ai-login-error" className="ai-login__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="ai-login__actions">
            <button type="submit" className="ai-login__primary" disabled={isBusy}>
              <span>{buttonLabel}</span>
              <span aria-hidden className="ai-login__primary-arrow">
                →
              </span>
            </button>
            <button
              type="button"
              className="ai-login__secondary"
              onClick={handleGuest}
              disabled={isBusy}
            >
              Continue as Guest
            </button>
          </div>
        </form>

        <footer className="ai-login__footer">
          <span>Bangkok · UTC+7</span>
          <span className="ai-login__footer-sep" aria-hidden>
            ·
          </span>
          <span>Zero-cost AI composer · no external billing</span>
        </footer>
      </main>
    </div>
  );
}

export { readAuthenticatedFlag };
