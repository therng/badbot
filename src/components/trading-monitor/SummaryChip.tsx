"use client";

import { useRef, useState } from "react";
import { type MetricTone } from "@/components/trading-monitor/formatters";

function useKpiHint() {
  const [visible, setVisible] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressTriggered = useRef(false);

  function show(autoDismiss: boolean) {
    clearTimeout(autoDismissTimer.current);
    setVisible(true);
    if (autoDismiss) {
      autoDismissTimer.current = setTimeout(() => setVisible(false), 3000);
    }
  }

  function hide() {
    clearTimeout(longPressTimer.current);
    clearTimeout(autoDismissTimer.current);
    setVisible(false);
  }

  const hintHandlers = {
    onMouseEnter: () => show(false),
    onMouseLeave: () => hide(),
    onTouchStart: () => {
      longPressTriggered.current = false;
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        show(true);
      }, 600);
    },
    onTouchEnd: () => {
      clearTimeout(longPressTimer.current);
    },
    onTouchMove: () => {
      clearTimeout(longPressTimer.current);
    },
  };

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

  return { visible, hintHandlers, wrapClick };
}

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
  const { visible: showHint, hintHandlers, wrapClick } = useKpiHint();
  const tooltip = fullValue ? `${label}: ${fullValue}` : undefined;
  const interactive = Boolean(onClick);
  const className = `kchip ${interactive ? "is-actionable" : "is-static"} ${isSelected ? "is-selected" : ""} ${hint ? "has-hint" : ""}`.trim();

  const hintNode = hint && showHint ? (
    <span className="kchip__hint" aria-live="polite">{hint}</span>
  ) : null;

  if (!interactive) {
    return (
      <div className={className} title={tooltip} aria-label={tooltip} {...hintHandlers}>
        <span className="kl">{label}</span>
        <strong className={`kv tone-${tone}`}>{value}</strong>
        {meta ? <span className="kchip__meta">{meta}</span> : null}
        {hintNode}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={isSelected}
      onClick={wrapClick(onClick)}
      {...hintHandlers}
    >
      <span className="kl">{label}</span>
      <strong className={`kv tone-${tone}`}>{value}</strong>
      {meta ? <span className="kchip__meta">{meta}</span> : null}
      {hintNode}
    </button>
  );
}
