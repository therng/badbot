"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { type MetricTone } from "@/components/trading-monitor/formatters";

export type KpiHintContent = {
  title?: string;
  definition: string;
  purpose?: string;
};

function normalizeKpiHint(hint: string | KpiHintContent): KpiHintContent {
  if (typeof hint === "string") {
    return { definition: hint };
  }

  return hint;
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
  const dragRef = useRef({
    pointerId: null as number | null,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
  });
  const content = normalizeKpiHint(hint);
  const bodyText = [content.definition, content.purpose].filter(Boolean).join(" ");

  const setDragOffset = useCallback((delta: number) => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }

    if (backdropRef.current) {
      backdropRef.current.style.opacity = String(Math.max(0.24, 1 - delta / 360));
    }
  }, []);

  const animateClosed = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 260ms cubic-bezier(0.4,0,1,1)";
      sheetRef.current.style.transform = "translateY(110%)";
    }

    if (backdropRef.current) {
      backdropRef.current.style.transition = "opacity 220ms ease";
      backdropRef.current.style.opacity = "0";
    }

    window.setTimeout(onClose, 260);
  }, [onClose]);

  const animateOpen = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 420ms cubic-bezier(0.16,1,0.3,1)";
      sheetRef.current.style.transform = "translateY(0)";
    }

    if (backdropRef.current) {
      backdropRef.current.style.transition = "opacity 320ms ease";
      backdropRef.current.style.opacity = "1";
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;

    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastTime: performance.now(),
      velocity: 0,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();

    if (sheetRef.current) {
      sheetRef.current.style.animation = "none";
      sheetRef.current.style.transition = "none";
    }

    if (backdropRef.current) {
      backdropRef.current.style.animation = "none";
      backdropRef.current.style.transition = "none";
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;

    const now = performance.now();
    const dt = Math.max(1, now - dragRef.current.lastTime);
    const rawDelta = e.clientY - dragRef.current.startY;
    const delta = rawDelta < 0 ? rawDelta * 0.18 : rawDelta;

    dragRef.current.velocity = (e.clientY - dragRef.current.lastY) / dt;
    dragRef.current.lastY = e.clientY;
    dragRef.current.lastTime = now;

    setDragOffset(delta);
    e.preventDefault();
    e.stopPropagation();
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;

    const delta = Math.max(0, e.clientY - dragRef.current.startY);
    const closeThreshold = Math.min(128, Math.max(72, (sheetRef.current?.offsetHeight ?? 320) * 0.28));
    const shouldClose = delta > closeThreshold || dragRef.current.velocity > 0.7;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    dragRef.current.pointerId = null;
    e.stopPropagation();

    if (shouldClose) {
      animateClosed();
      return;
    }

    animateOpen();
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className="kpi-sheet__handle" aria-hidden />
        <div className="kpi-sheet__head">
          <span className="kpi-sheet__metric-label">{content.title ?? label}</span>
        </div>
        <div className="kpi-sheet__divider" />
        <p className="kpi-sheet__body">{bodyText}</p>
      </div>
    </div>,
    document.body,
  );
}

// ── Hook ──────────────────────────────────────────────────────
function useKpiHint(hasHint: boolean) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const chipRef = useRef<HTMLElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    return () => {
      clearTimeout(longPressTimer.current);
    };
  }, []);

  const openSheet = useCallback(() => {
    try { navigator.vibrate?.(12); } catch { /* ignore */ }
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const clearLongPress = useCallback(() => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = undefined;
  }, []);

  const handleTouchStart = useCallback(() => {
    if (!hasHint) return;
    longPressTriggeredRef.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      openSheet();
    }, 500);
  }, [clearLongPress, hasHint, openSheet]);

  const handleTouchMove = useCallback(() => {
    if (!hasHint) return;
    clearLongPress();
  }, [clearLongPress, hasHint]);

  const handleTouchCancel = useCallback(() => {
    if (!hasHint) return;
    clearLongPress();
  }, [clearLongPress, hasHint]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!hasHint) return;
    clearLongPress();

    if (longPressTriggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }

    window.setTimeout(() => {
      longPressTriggeredRef.current = false;
    }, 0);
  }, [clearLongPress, hasHint]);

  function wrapClick(onClick?: () => void) {
    return (e: React.MouseEvent) => {
      if (hasHint && longPressTriggeredRef.current) {
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
    sheetOpen,
    closeSheet,
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
  const { chipRef, sheetOpen, closeSheet, handleTouchStart, handleTouchMove, handleTouchCancel, handleTouchEnd, wrapClick } =
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchCancel}
      onTouchEnd={handleTouchEnd}
    >
      {inner}
    </button>
  );
}
