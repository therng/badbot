"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { type MetricTone } from "@/components/trading-monitor/formatters";

export type KpiHintContent = {
  definition: string;
  purpose?: string;
};

function normalizeKpiHint(hint: string | KpiHintContent): KpiHintContent {
  if (typeof hint === "string") {
    return { definition: hint };
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
  const textCls = classPrefix === "kpi-tooltip" ? `${classPrefix}__text` : `${classPrefix}__hint`;
  return (
    <>
      <div className={`${classPrefix}__section`}>
        <span className={`${classPrefix}__section-label`}>นิยาม</span>
        <p className={textCls}>{content.definition}</p>
      </div>
      {content.purpose && (
        <div className={`${classPrefix}__section ${classPrefix}__section--purpose`}>
          <span className={`${classPrefix}__section-label ${classPrefix}__section-label--purpose`}>วัตถุประสงค์</span>
          <p className={textCls}>{content.purpose}</p>
        </div>
      )}
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
  anchorRect,
}: {
  hint: string | KpiHintContent;
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
  onClose,
}: {
  hint: string | KpiHintContent;
  label: string;
  value: string;
  tone: MetricTone;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const prevYRef = useRef(0);
  const prevTimeRef = useRef(0);
  const content = normalizeKpiHint(hint);
  const bodyText = [content.definition, content.purpose].filter(Boolean).join(" ");

  const handleTouchStart = (e: React.TouchEvent) => {
    const y = e.touches[0]?.clientY ?? 0;
    startYRef.current = y;
    prevYRef.current = y;
    prevTimeRef.current = Date.now();
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const y = e.touches[0]?.clientY ?? 0;
    const delta = Math.max(0, y - startYRef.current);
    prevYRef.current = y;
    prevTimeRef.current = Date.now();
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`;
    if (backdropRef.current) {
      backdropRef.current.style.opacity = String(Math.max(0.4, 1 - delta / 280));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const y = e.changedTouches[0]?.clientY ?? 0;
    const delta = Math.max(0, y - startYRef.current);
    const dt = Math.max(1, Date.now() - prevTimeRef.current);
    const velocity = (y - prevYRef.current) / dt;
    startYRef.current = null;

    if (delta > 80 || velocity > 0.4) {
      if (sheetRef.current) {
        sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.4,0,1,1)";
        sheetRef.current.style.transform = "translateY(110%)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "opacity 300ms ease";
        backdropRef.current.style.opacity = "0";
      }
      setTimeout(onClose, 300);
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = "transform 500ms cubic-bezier(0.16,1,0.3,1)";
        sheetRef.current.style.transform = "translateY(0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "opacity 400ms ease";
        backdropRef.current.style.opacity = "1";
      }
    }
  };

  return createPortal(
    <div
      ref={backdropRef}
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
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="kpi-sheet__handle" aria-hidden />
        <p className="kpi-sheet__body">{bodyText}</p>
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
  const tooltipOpenTimer = useRef<ReturnType<typeof setTimeout>>();
  const tooltipCloseTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    return () => {
      clearTimeout(longPressTimer.current);
      clearTimeout(tooltipOpenTimer.current);
      clearTimeout(tooltipCloseTimer.current);
    };
  }, []);

  const openSheet = useCallback(() => {
    try { navigator.vibrate?.(12); } catch { /* ignore */ }
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const openTooltip = useCallback(() => {
    if (!chipRef.current) return;
    clearTimeout(tooltipOpenTimer.current);
    clearTimeout(tooltipCloseTimer.current);
    tooltipOpenTimer.current = setTimeout(() => {
      if (!chipRef.current) return;
      setTooltipRect(chipRef.current.getBoundingClientRect());
    }, 400);
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
    }, 500);
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
        <KpiTooltip hint={hint} anchorRect={tooltipRect} />
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
