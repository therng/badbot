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
      <div className="ls__inner">
        <div className="ls__chart" aria-hidden="true">
          <svg viewBox="0 0 280 130" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="ls-glow" x="-20%" y="-60%" width="140%" height="220%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              className="ls__wave-glow"
              d="M10,104 C48,104 52,22 90,22 C128,22 132,82 170,58 C208,34 238,10 270,10"
              fill="none"
              stroke="#3d9eff"
              strokeWidth="6"
              strokeLinecap="round"
              filter="url(#ls-glow)"
            />
            <path
              className="ls__wave"
              d="M10,104 C48,104 52,22 90,22 C128,22 132,82 170,58 C208,34 238,10 270,10"
              fill="none"
              stroke="#a0d4ff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h1 className="ls__logo" aria-label="Analytic">
          ANALYT<span className="ls__logo-i">i</span>C
        </h1>

        <div className="ls__badge" aria-hidden="true">
          <span className="ls__badge-star">✦</span>
          <span>AI CORE</span>
        </div>

        <p className="ls__status">&ldquo;Initializing Ai-Core...&rdquo;</p>

        <hr className="ls__divider" />

        <p className="ls__footer-title">NEURAL SYNCING</p>
        <p className="ls__footer-sub">NODE INSTANCE: FREE TIER ACTIVE</p>
      </div>
    </div>
  );
}
