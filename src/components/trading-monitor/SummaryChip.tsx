"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { type MetricTone } from "@/components/trading-monitor/formatters";

export type KpiHintContent = {
  definition: string;
  purpose: string;
  howToRead?: string;
};

function normalizeKpiHint(hint: string | KpiHintContent): KpiHintContent {
  if (typeof hint === "string") {
    return {
      definition: hint,
      purpose: "",
    };
  }

  return hint;
}

// ── Shared hint sections ────────────────────────────────────
function KpiHintSections({
  content,
  classPrefix,
}: {
  content: KpiHintContent;
  classPrefix: "kpi-tooltip" | "kpi-sheet";
}) {
  const labelCls = `${classPrefix}__section-label`;
  const textCls = classPrefix === "kpi-tooltip" ? `${classPrefix}__text` : `${classPrefix}__hint`;
  const sectionCls = `${classPrefix}__section`;

  return (
    <>
      <div className={sectionCls}>
        <span className={labelCls}>นิยาม</span>
        <p className={textCls}>{content.definition}</p>
      </div>
      {content.purpose ? (
        <div className={sectionCls}>
          <span className={labelCls}>ใช้ดูอะไร</span>
          <p className={textCls}>{content.purpose}</p>
        </div>
      ) : null}
      {content.howToRead ? (
        <div className={sectionCls}>
          <span className={labelCls}>ตีความเร็ว</span>
          <p className={textCls}>{content.howToRead}</p>
        </div>
      ) : null}
    </>
  );
}

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
  hint: string | KpiHintContent;
  label: string;
  anchorRect: DOMRect;
}) {
  const TOOLTIP_W = 300;
  const GAP = 10;
  const content = normalizeKpiHint(hint);

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 800;

  const rawLeft = anchorRect.left + anchorRect.width / 2 - TOOLTIP_W / 2;
  const left = Math.max(8, Math.min(rawLeft, viewportW - TOOLTIP_W - 8));

  // Prefer above; fall back to below if not enough room
  const spaceAbove = anchorRect.top;
  const openAbove = spaceAbove > 220;

  const top = openAbove
    ? anchorRect.top - GAP
    : anchorRect.bottom + GAP;

  return createPortal(
    <div
      className={`kpi-tooltip ${openAbove ? "kpi-tooltip--above" : "kpi-tooltip--below"}`}
      style={{ top, left, width: TOOLTIP_W }}
      role="tooltip"
    >
      <div className="kpi-tooltip__inner">
        <span className="kpi-tooltip__label">{label}</span>
        <KpiHintSections content={content} classPrefix="kpi-tooltip" />
      </div>
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
  hint: string | KpiHintContent;
  label: string;
  value: string;
  tone: MetricTone;
  onClose: () => void;
}) {
  // Swipe-down to dismiss
  const startYRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const content = normalizeKpiHint(hint);

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
        <span className="kpi-sheet__hint-title">คำอธิบาย KPI</span>
        <KpiHintSections content={content} classPrefix="kpi-sheet" />

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
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const tooltipOpenTimer = useRef<ReturnType<typeof setTimeout>>();
  const tooltipCloseTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    return () => {
      clearTimeout(autoDismissTimer.current);
      clearTimeout(longPressTimer.current);
      clearTimeout(tooltipOpenTimer.current);
      clearTimeout(tooltipCloseTimer.current);
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
    clearTimeout(tooltipOpenTimer.current);
    clearTimeout(tooltipCloseTimer.current);
    tooltipOpenTimer.current = setTimeout(() => {
      if (!chipRef.current) return;
      setTooltipRect(chipRef.current.getBoundingClientRect());
    }, 5000);
  }, []);

  const closeTooltip = useCallback(() => {
    clearTimeout(tooltipOpenTimer.current);
    clearTimeout(tooltipCloseTimer.current);
    tooltipCloseTimer.current = setTimeout(() => {
      setTooltipRect(null);
    }, 260);
  }, []);

  const clearLongPress = useCallback(() => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = undefined;
  }, []);

  const handleTouchStart = useCallback(() => {
    if (!hasHint || !isTouchPrimary()) return;
    longPressTriggeredRef.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      openSheet();
    }, 300);
  }, [clearLongPress, hasHint, openSheet]);

  const handleTouchMove = useCallback(() => {
    if (!hasHint || !isTouchPrimary()) return;
    clearLongPress();
  }, [clearLongPress, hasHint]);

  const handleTouchCancel = useCallback(() => {
    if (!hasHint || !isTouchPrimary()) return;
    clearLongPress();
  }, [clearLongPress, hasHint]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!hasHint || !isTouchPrimary()) return;
    clearLongPress();

    if (longPressTriggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }

    window.setTimeout(() => {
      longPressTriggeredRef.current = false;
    }, 0);
  }, [clearLongPress, hasHint]);

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
      }
    : {};

  function wrapClick(onClick?: () => void) {
    return (e: React.MouseEvent) => {
      if (hasHint && isTouchPrimary() && longPressTriggeredRef.current) {
        e.preventDefault();
        e.stopPropagation();
        longPressTriggeredRef.current = false;
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
    handleTouchStart,
    handleTouchMove,
    handleTouchCancel,
    handleTouchEnd,
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
  hint?: string | KpiHintContent;
  onClick?: () => void;
  isSelected?: boolean;
}) {
  const { chipRef, tooltipRect, sheetOpen, closeSheet, hintHandlers, handleTouchStart, handleTouchMove, handleTouchCancel, handleTouchEnd, wrapClick } =
    useKpiHint(Boolean(hint));

  const tooltip = fullValue ? `${label}: ${fullValue}` : undefined;
  const interactive = Boolean(onClick);
  const className =
    `kchip ${interactive ? "is-actionable" : "is-static"} ${isSelected ? "is-selected" : ""} ${hint ? "has-hint" : ""}`.trim();

  const inner = (
    <>
      <span className="kl">
        {label}
        {hint ? (
          <span
            className="kchip__hint-badge"
            aria-label="ดูคำอธิบาย"
          >?</span>
        ) : null}
      </span>
      <strong className={`kv tone-${tone}`}>{value}</strong>
      {meta ? <span className="kchip__meta">{meta}</span> : null}

      {/* Desktop tooltip (hover) */}
      {hint && tooltipRect ? (
        <KpiTooltip hint={hint} label={label} anchorRect={tooltipRect} />
      ) : null}

      {/* Mobile action sheet (tap) */}
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchCancel={handleTouchCancel}
        onTouchEnd={handleTouchEnd}
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchCancel}
      onTouchEnd={handleTouchEnd}
    >
      {inner}
    </button>
  );
}
