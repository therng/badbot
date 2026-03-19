"use client";

import { useId, useState } from "react";

import type { ChartPoint, EquityEventPoint, Timeframe } from "@/lib/trading/types";

import {
  TIMEFRAME_OPTIONS,
  buildSparkline,
  clamp,
  drawdownTone,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  labelBalanceEvent,
} from "@/components/trading-monitor/formatters";

export function TimeframeStrip({
  active,
  onChange,
}: {
  active: Timeframe;
  onChange: (value: Timeframe) => void;
}) {
  return (
    <div className="timeframe-strip" role="tablist" aria-label="Select timeframe">
      {TIMEFRAME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === active ? "timeframe-pill is-active" : "timeframe-pill"}
          aria-label={option.ariaLabel}
          aria-pressed={option.value === active}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function InlineState({
  tone,
  title,
  message,
}: {
  tone: "error" | "empty" | "info";
  title: string;
  message: string;
}) {
  return (
    <div className={`section-state is-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

export function SectionSkeleton() {
  return (
    <div className="section-skeleton" aria-hidden="true">
      <div className="skeleton-line skeleton-line--title" />
      <div className="skeleton-line skeleton-line--wide" />
      <div className="skeleton-chart" />
      <div className="metric-cluster">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="metric-tile is-skeleton">
            <div className="skeleton-line skeleton-line--tiny" />
            <div className="skeleton-line skeleton-line--small" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <p>{description}</p>
    </div>
  );
}

export function MetricTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "warning" | "neutral" | "muted";
}) {
  return (
    <div className={`metric-tile tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function GaugeCard({
  label,
  value,
  max,
  tone,
  helper,
}: {
  label: string;
  value: number | null | undefined;
  max: number;
  tone: "positive" | "negative" | "warning" | "neutral" | "muted";
  helper: string;
}) {
  const percent = Number.isFinite(value) ? clamp((Math.abs(value ?? 0) / max) * 100, 0, 100) : 0;

  return (
    <div className="gauge-card">
      <div className="gauge-card__topline">
        <span>{label}</span>
        <strong>{Number.isFinite(value) ? formatNumber(value, 2) : "-"}</strong>
      </div>
      <div className="gauge-bar" aria-hidden="true">
        <span className={`gauge-bar__fill tone-${tone}`} style={{ width: `${percent}%` }} />
      </div>
      <p>{helper}</p>
    </div>
  );
}

export function PairBar({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  leftLabel: string;
  leftValue: number;
  rightLabel: string;
  rightValue: number;
}) {
  const total = Math.abs(leftValue) + Math.abs(rightValue);
  const leftWidth = total ? (Math.abs(leftValue) / total) * 100 : 0;
  const rightWidth = total ? (Math.abs(rightValue) / total) * 100 : 0;

  return (
    <div className="pair-card">
      <div className="pair-card__labels">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="pair-bar" aria-hidden="true">
        <span className="pair-bar__fill is-left" style={{ width: `${leftWidth}%` }} />
        <span className="pair-bar__fill is-right" style={{ width: `${rightWidth}%` }} />
      </div>
      <div className="pair-card__values">
        <strong>{formatSignedCurrency(leftValue)}</strong>
        <strong>{formatSignedCurrency(rightValue)}</strong>
      </div>
    </div>
  );
}

export function SparklineChart({
  points,
  active,
  tone = "neutral",
}: {
  points: ChartPoint[];
  active: boolean;
  tone?: "positive" | "negative" | "neutral" | "muted";
}) {
  const gradientId = useId();
  const values = points.map((point) => Number(point.y ?? 0)).filter(Number.isFinite);
  const { linePath, fillPath, points: sparklinePoints } = buildSparkline(values, 320, 84);
  const lastPoint = sparklinePoints.at(-1);

  const palette =
    tone === "positive"
      ? {
          fillTop: "rgba(0, 212, 164, 0.18)",
          stroke: "#00d4a4",
          point: "#00d4a4",
        }
      : tone === "negative"
        ? {
            fillTop: "rgba(255, 107, 107, 0.18)",
            stroke: "#ff6b6b",
            point: "#ff6b6b",
          }
        : {
            fillTop: active ? "rgba(126, 184, 247, 0.18)" : "rgba(200, 169, 110, 0.16)",
            stroke: active ? "#7eb8f7" : "#c8a96e",
            point: active ? "#7eb8f7" : "#c8a96e",
          };

  if (!linePath) {
    return <div className="chart-empty">No equity curve for this timeframe.</div>;
  }

  return (
    <svg className="sparkline-chart" viewBox="0 0 320 84" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.fillTop} />
          <stop offset="100%" stopColor="rgba(10, 14, 24, 0)" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={palette.stroke}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastPoint ? (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="2.6"
          fill={palette.point}
          stroke="rgba(11, 14, 22, 0.95)"
          strokeWidth="1.4"
        />
      ) : null}
    </svg>
  );
}

export function BalanceEventChart({ points }: { points: EquityEventPoint[] }) {
  const [activeIndex, setActiveIndex] = useState(points.length ? points.length - 1 : 0);

  if (!points.length) {
    return <div className="chart-empty">No balance events were captured for this timeframe.</div>;
  }

  const width = 920;
  const height = 300;
  const paddingX = 20;
  const paddingY = 24;
  const minValue = Math.min(...points.map((point) => point.balance));
  const maxValue = Math.max(...points.map((point) => point.balance));
  const range = maxValue - minValue || 1;

  const coordinates = points.map((point, index) => ({
    ...point,
    xCoord: paddingX + (index / Math.max(1, points.length - 1)) * (width - paddingX * 2),
    yCoord: paddingY + (1 - (point.balance - minValue) / range) * (height - paddingY * 2),
  }));

  const activePoint = coordinates[activeIndex] ?? coordinates[coordinates.length - 1];

  return (
    <div className="chart-card">
      <svg className="detail-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Balance event chart">
        <g className="chart-grid" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => {
            const y = paddingY + (index / 3) * (height - paddingY * 2);
            return <line key={index} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />;
          })}
        </g>
        {coordinates.slice(1).map((point, index) => {
          const previous = coordinates[index];
          const label = labelBalanceEvent(point.eventType, point.eventDelta);
          const tone =
            label === "Deposit" ? "var(--positive)" : label === "Withdrawal" ? "var(--negative)" : "var(--accent-bright)";

          return (
            <line
              key={`${point.x}-${index}`}
              x1={previous.xCoord}
              x2={point.xCoord}
              y1={previous.yCoord}
              y2={point.yCoord}
              stroke={tone}
              strokeWidth="4"
              strokeLinecap="round"
            />
          );
        })}
        {coordinates.map((point, index) => {
          const label = labelBalanceEvent(point.eventType, point.eventDelta);
          const tone =
            label === "Deposit" ? "var(--positive)" : label === "Withdrawal" ? "var(--negative)" : "var(--accent-bright)";

          return (
            <circle
              key={`${point.x}-${index}-dot`}
              cx={point.xCoord}
              cy={point.yCoord}
              r={index === activeIndex ? 6 : 4}
              fill={tone}
              stroke="rgba(11, 15, 27, 0.95)"
              strokeWidth="2"
              tabIndex={0}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
            />
          );
        })}
      </svg>
      <div className="chart-caption">
        <div>
          <span>Timestamp</span>
          <strong>{formatDateTime(activePoint?.x)}</strong>
        </div>
        <div>
          <span>Balance</span>
          <strong>{formatCurrency(activePoint?.balance)}</strong>
        </div>
        <div>
          <span>Event</span>
          <strong>{labelBalanceEvent(activePoint?.eventType, activePoint?.eventDelta)}</strong>
        </div>
        <div>
          <span>Amount</span>
          <strong className={`tone-${drawdownTone(Math.abs(activePoint?.eventDelta ?? 0))}`}>
            {formatSignedCurrency(activePoint?.eventDelta)}
          </strong>
        </div>
      </div>
    </div>
  );
}

export function MiniDrawdownChart({ points }: { points: ChartPoint[] }) {
  if (!points.length) {
    return <div className="chart-empty">No drawdown data available.</div>;
  }

  const values = points.map((point) => Number(point.y ?? 0));
  const { linePath } = buildSparkline(values, 320, 84);
  if (!linePath) {
    return <div className="chart-empty">No drawdown data available.</div>;
  }

  return (
    <svg className="sparkline-chart" viewBox="0 0 320 84" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={linePath}
        fill="none"
        stroke="var(--warning)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ToneNumber({
  value,
  digits = 0,
}: {
  value: number | null | undefined;
  digits?: number;
}) {
  return (
    <strong className={`tone-${drawdownTone(Math.abs(value ?? 0))}`}>
      {digits > 0 ? formatPercent(value, digits) : formatSignedCurrency(value)}
    </strong>
  );
}
