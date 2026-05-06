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

// ── KPI Preview Card ──────────────────────────────────────────
export function KpiPreviewCard({
  hint,
  label,
  onClose,
  triggerRef,
}: {
  hint: string | KpiHintContent;
  label: string;
  value?: string;
  tone?: MetricTone;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const [origin, setOrigin] = useState({ tx: 0, ty: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const content = normalizeKpiHint(hint);

  useEffect(() => {
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const wx = window.innerWidth / 2;
      const wy = window.innerHeight / 2;
      setOrigin({ tx: cx - wx, ty: cy - wy });
    }
  }, [triggerRef]);

  useEffect(() => {
    if (!isClosing) {
      cardRef.current?.focus();
    }
  }, [isClosing]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 260); // match CSS animation duration
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  return createPortal(
    <div
      className={`kpi-card-backdrop ${isClosing ? "is-closing" : ""}`}
      onClick={handleClose}
      aria-modal="true"
      role="dialog"
      aria-label={`${label} — คำอธิบาย`}
    >
      <div
        ref={cardRef}
        className={`kpi-card ${isClosing ? "is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        style={{
          "--origin-x": `${origin.tx}px`,
          "--origin-y": `${origin.ty}px`,
        } as React.CSSProperties}
      >
        <div className="kpi-card__head">
          <span className="kpi-card__metric-label">{content.title ?? label}</span>
        </div>
        <div className="kpi-card__divider" />
        <div className="kpi-card__body">
          <p className="kpi-card__body-definition">{content.definition}</p>
          {content.purpose ? <p className="kpi-card__body-purpose">{content.purpose}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Hook ──────────────────────────────────────────────────────
export function useKpiHint(hasHint: boolean) {
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

      {/* Preview Card (tap/long-press) */}
      {hint && sheetOpen ? (
        <KpiPreviewCard
          hint={hint}
          label={label}
          value={value}
          tone={tone}
          onClose={closeSheet}
          triggerRef={chipRef}
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
