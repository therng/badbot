"use client";
import { useCallback, useEffect, useState } from "react";

export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"enter" | "idle" | "exit">("enter");

  const done = useCallback(onDone, [onDone]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("idle"), 80);
    const t2 = setTimeout(() => setPhase("exit"), 2200);
    const t3 = setTimeout(done, 2900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [done]);

  return (
    <div className={`ls ls--${phase}`} role="status" aria-label="Loading">
      <div className="ls__blob ls__blob--tl" aria-hidden="true" />
      <div className="ls__blob ls__blob--br" aria-hidden="true" />

      <div className="ls__inner">
        <div className="ls__chart" aria-hidden="true">
          <svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="ls-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0" />
                <stop offset="40%" stopColor="#60A5FA" stopOpacity="1" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="1" />
              </linearGradient>
              <filter id="ls-soft-glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d="M40 20 V100 H160"
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
            <path
              className="ls__wave"
              d="M40 85 Q60 90 80 55 T120 45 T165 35"
              fill="none"
              stroke="url(#ls-line-grad)"
              strokeWidth="4"
              strokeLinecap="round"
              filter="url(#ls-soft-glow)"
            />
            <circle className="ls__dot" cx="80" cy="55" r="2.5" fill="#60A5FA" />
            <circle className="ls__dot ls__dot--delayed" cx="120" cy="45" r="2.5" fill="#60A5FA" />
          </svg>
        </div>

        <h1 className="ls__logo" aria-label="Analytic">
          ANALYT<span className="ls__logo-i">I<span className="ls__logo-dot" aria-hidden="true" /></span>C
        </h1>

        <div className="ls__badge" aria-hidden="true">
          <span>✨</span>
          <span>AI CORE</span>
        </div>

        <p className="ls__status">&ldquo;Initializing Ai-Core...&rdquo;</p>

        <div className="ls__scan" aria-hidden="true" />

        <p className="ls__footer-title">NEURAL SYNCING</p>
        <p className="ls__footer-sub">NODE INSTANCE: FREE TIER ACTIVE</p>
      </div>
    </div>
  );
}
