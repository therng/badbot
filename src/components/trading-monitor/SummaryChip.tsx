"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { type MetricTone } from "@/components/trading-monitor/formatters";

// ── Detect coarse-pointer (touch) device ─────────────────────
function isTouchPrimary(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

// ── Desktop Tooltip ───────────────────────────────────────────
function KpiTooltip({
  hint,
  label,
  anchorRect,
}: {
  hint: string;
  label: string;
  anchorRect: DOMRect;
}) {
  const TOOLTIP_W = 252;
  const GAP = 10;

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 800;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 600;

  const rawLeft = anchorRect.left + anchorRect.width / 2 - TOOLTIP_W / 2;
  const left = Math.max(8, Math.min(rawLeft, viewportW - TOOLTIP_W - 8));

  // Prefer above; fall back to below if not enough room
  const spaceAbove = anchorRect.top;
  const openAbove = spaceAbove > 120;

  const top = openAbove
    ? anchorRect.top - GAP
    : anchorRect.bottom + GAP;

  return createPortal(
    <div
      className={`kpi-tooltip ${openAbove ? "kpi-tooltip--above" : "kpi-tooltip--below"}`}
      style={{ top, left, width: TOOLTIP_W }}
      role="tooltip"
    >
      <span className="kpi-tooltip__label">{label}</span>
      <p className="kpi-tooltip__text">{hint}</p>
      {openAbove && (
        <span className="kpi-tooltip__arrow kpi-tooltip__arrow--down" aria-hidden />
      )}
      {!openAbove && (
        <span className="kpi-tooltip__arrow kpi-tooltip__arrow--up" aria-hidden />
      )}
    </div>,
    document.body,
  );
}

// ── Mobile Action Sheet ───────────────────────────────────────
function KpiActionSheet({
  hint,
  label,
  value,
  tone,
  onClose,
}: {
  hint: string;
  label: string;
  value: string;
  tone: MetricTone;
  onClose: () => void;
}) {
  // Swipe-down to dismiss
  const startYRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0]?.clientY ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const delta = (e.changedTouches[0]?.clientY ?? 0) - startYRef.current;
    if (delta > 60) onClose();
    startYRef.current = null;
  };

  return createPortal(
    <div
      className="kpi-sheet-backdrop"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={`${label} — คำอธิบาย`}
    >
      <div
        ref={sheetRef}
        className="kpi-sheet"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="kpi-sheet__handle" aria-hidden />

        {/* Metric identity */}
        <div className="kpi-sheet__head">
          <span className="kpi-sheet__metric-label">{label}</span>
          <strong className={`kpi-sheet__metric-value tone-${tone}`}>{value}</strong>
        </div>

        {/* Divider */}
        <div className="kpi-sheet__divider" aria-hidden />

        {/* Hint text */}
        <p className="kpi-sheet__hint">{hint}</p>

        {/* Dismiss */}
        <button
          type="button"
          className="kpi-sheet__close"
          onClick={onClose}
        >
          ปิด
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ── Hook ──────────────────────────────────────────────────────
function useKpiHint(hasHint: boolean) {
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const chipRef = useRef<HTMLElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressTriggered = useRef(false);

  useEffect(() => {
    return () => {
      clearTimeout(longPressTimer.current);
      clearTimeout(autoDismissTimer.current);
    };
  }, []);

  const openSheet = useCallback(() => {
    try { navigator.vibrate?.(12); } catch { /* ignore */ }
    clearTimeout(autoDismissTimer.current);
    setSheetOpen(true);
    autoDismissTimer.current = setTimeout(() => setSheetOpen(false), 8000);
  }, []);

  const closeSheet = useCallback(() => {
    clearTimeout(autoDismissTimer.current);
    setSheetOpen(false);
  }, []);

  const openTooltip = useCallback(() => {
    if (!chipRef.current) return;
    setTooltipRect(chipRef.current.getBoundingClientRect());
  }, []);

  const closeTooltip = useCallback(() => {
    setTooltipRect(null);
  }, []);

  const hintHandlers = hasHint
    ? {
        onMouseEnter: () => {
          if (isTouchPrimary()) return;
          openTooltip();
        },
        onMouseLeave: () => {
          if (isTouchPrimary()) return;
          closeTooltip();
        },
        onTouchStart: () => {
          longPressTriggered.current = false;
          longPressTimer.current = setTimeout(() => {
            longPressTriggered.current = true;
            openSheet();
          }, 480);
        },
        onTouchEnd: () => {
          clearTimeout(longPressTimer.current);
        },
        onTouchMove: () => {
          clearTimeout(longPressTimer.current);
        },
      }
    : {};

  function wrapClick(onClick?: () => void) {
    return (e: React.MouseEvent) => {
      if (longPressTriggered.current) {
        e.preventDefault();
        e.stopPropagation();
        longPressTriggered.current = false;
        return;
      }
      onClick?.();
    };
  }

  return {
    chipRef,
    tooltipRect,
    sheetOpen,
    closeSheet,
    hintHandlers,
    wrapClick,
  };
}

// ── SummaryChip ───────────────────────────────────────────────
export function SummaryChip({
  label,
  value,
  tone = "neutral",
  meta,
  fullValue,
  hint,
  onClick,
  isSelected = false,
}: {
  label: string;
  value: string;
  tone?: MetricTone;
  meta?: string;
  fullValue?: string;
  hint?: string;
  onClick?: () => void;
  isSelected?: boolean;
}) {
  const { chipRef, tooltipRect, sheetOpen, closeSheet, hintHandlers, wrapClick } =
    useKpiHint(Boolean(hint));

  const tooltip = fullValue ? `${label}: ${fullValue}` : undefined;
  const interactive = Boolean(onClick);
  const className =
    `kchip ${interactive ? "is-actionable" : "is-static"} ${isSelected ? "is-selected" : ""} ${hint ? "has-hint" : ""}`.trim();

  const inner = (
    <>
      <span className="kl">{label}</span>
      <strong className={`kv tone-${tone}`}>{value}</strong>
      {meta ? <span className="kchip__meta">{meta}</span> : null}

      {/* Desktop tooltip (hover) */}
      {hint && tooltipRect ? (
        <KpiTooltip hint={hint} label={label} anchorRect={tooltipRect} />
      ) : null}

      {/* Mobile action sheet (long-press) */}
      {hint && sheetOpen ? (
        <KpiActionSheet
          hint={hint}
          label={label}
          value={value}
          tone={tone}
          onClose={closeSheet}
        />
      ) : null}
    </>
  );

  if (!interactive) {
    return (
      <div
        ref={chipRef as React.RefObject<HTMLDivElement>}
        className={className}
        title={tooltip}
        aria-label={tooltip}
        {...hintHandlers}
      >
        {inner}
      </div>
    );
  }

  return (
    <button
      ref={chipRef as React.RefObject<HTMLButtonElement>}
      type="button"
      className={className}
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={isSelected}
      onClick={wrapClick(onClick)}
      {...hintHandlers}
    >
      {inner}
    </button>
  );
}
