"use client";

import { useId, useState } from "react";

import type { BalanceEventPoint, ChartPoint, Timeframe } from "@/lib/trading/types";

import {
  TIMEFRAME_OPTIONS,
  buildSmoothPath,
  buildSmoothSegmentPath,
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

function getTimestampValue(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function startOfDayWindow(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDayWindow(timestamp: number) {
  return startOfDayWindow(timestamp) + 24 * 60 * 60 * 1000;
}

function resolveBalanceValue(point: ChartPoint | BalanceEventPoint) {
  const balance = (point as Partial<BalanceEventPoint>).balance;
  if (typeof balance === "number" && Number.isFinite(balance)) {
    return balance;
  }

  return Number(point.y ?? 0);
}

function withLivePoint(
  points: Array<ChartPoint | BalanceEventPoint>,
  liveTimestamp: Date | string | null | undefined,
  liveBalance: number | null | undefined,
) {
  const timestamp = getTimestampValue(liveTimestamp);
  if (timestamp === null || !Number.isFinite(liveBalance)) {
    return points;
  }

  const liveX = new Date(timestamp).toISOString();
  const livePoint: BalanceEventPoint = {
    x: liveX,
    y: Number(liveBalance),
    balance: Number(liveBalance),
    eventType: null,
    eventDelta: null,
  };

  if (!points.length) {
    return [livePoint];
  }

  const lastPoint = points[points.length - 1];
  const lastTimestamp = getTimestampValue(lastPoint?.x);
  if (lastTimestamp === null) {
    return [...points, livePoint];
  }

  if (timestamp > lastTimestamp) {
    return [...points, livePoint];
  }

  if (Math.abs(timestamp - lastTimestamp) <= 60_000) {
    return [...points.slice(0, -1), { ...lastPoint, ...livePoint }];
  }

  return points;
}

function buildDailyTimePoints(
  points: Array<ChartPoint | BalanceEventPoint>,
  width: number,
  height: number,
  liveTimestamp: Date | string | null | undefined,
) {
  if (!points.length) {
    return { linePath: "", fillPath: "", points: [] as Array<{ x: number; y: number }> };
  }

  const values = points.map((point) => Number(point.y ?? 0)).filter(Number.isFinite);
  const minimum = Math.min(...values);
  const range = Math.max(...values) - minimum || 1;
  const horizontalInset = Math.min(6, width / 24);
  const topInset = Math.min(6, height / 10);
  const bottomInset = Math.min(14, height / 4.5);
  const plotWidth = Math.max(width - horizontalInset * 2, 1);
  const plotHeight = Math.max(height - topInset - bottomInset, 1);
  const anchorTimestamp =
    getTimestampValue(liveTimestamp)
    ?? getTimestampValue(points[points.length - 1]?.x)
    ?? Date.now();
  const dayStart = startOfDayWindow(anchorTimestamp);
  const dayEnd = endOfDayWindow(anchorTimestamp);

  const timelinePoints = points.map((point) => {
    const timestamp = getTimestampValue(point.x) ?? anchorTimestamp;
    const clampedTimestamp = clamp(timestamp, dayStart, dayEnd);
    return {
      x: Number((horizontalInset + ((clampedTimestamp - dayStart) / (dayEnd - dayStart)) * plotWidth).toFixed(2)),
      y: Number((topInset + (1 - (Number(point.y ?? 0) - minimum) / range) * plotHeight).toFixed(2)),
    };
  });

  const linePath = buildSmoothPath(timelinePoints);
  return {
    points: timelinePoints,
    linePath,
    fillPath: `${linePath} L ${width - horizontalInset} ${height} L ${horizontalInset} ${height} Z`,
  };
}

export function SparklineChart({
  points,
  active,
  tone = "neutral",
  onHighlightBalanceChange,
  timeframe = "all",
  liveTimestamp,
  liveBalance,
}: {
  points: Array<ChartPoint | BalanceEventPoint>;
  active: boolean;
  tone?: "positive" | "negative" | "neutral" | "muted";
  onHighlightBalanceChange?: (balance: number | null) => void;
  timeframe?: Timeframe;
  liveTimestamp?: Date | string | null;
  liveBalance?: number | null;
}) {
  const chartWidth = 320;
  const chartHeight = 112;
  const gradientId = useId();
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const resolvedPoints =
    timeframe === "1d"
      ? withLivePoint(points, liveTimestamp, liveBalance)
      : points;
  const values = resolvedPoints.map((point) => Number(point.y ?? 0)).filter(Number.isFinite);
  const { fillPath, linePath, points: sparklinePoints } =
    timeframe === "1d"
      ? buildDailyTimePoints(resolvedPoints, chartWidth, chartHeight, liveTimestamp)
      : buildSparkline(values, chartWidth, chartHeight);
  const lastIndex = Math.max(0, sparklinePoints.length - 1);
  const currentPoint = sparklinePoints[lastIndex];
  const activeIndex = highlightedIndex ?? lastIndex;
  const activePoint = sparklinePoints[activeIndex] ?? sparklinePoints[lastIndex];
  const statusPointColor = active ? "var(--positive)" : "rgba(5, 8, 12, 0.96)";
  const showActiveMarker = Boolean(activePoint);
  const showPulseDot = active && Boolean(currentPoint);
  const beaconStyle =
    currentPoint && showPulseDot
      ? {
          left: `${(currentPoint.x / chartWidth) * 100}%`,
          top: `${(currentPoint.y / chartHeight) * 100}%`,
          color: statusPointColor,
        }
      : null;
  const strokeByTone = {
    positive: "var(--positive)",
    negative: "var(--negative)",
    neutral: "var(--account-chart, var(--neutral))",
    muted: "var(--account-chart-muted, #7d8fa6)",
  } as const;

  const palette = {
    stroke: strokeByTone[tone],
    areaTop:
      tone === "positive"
        ? "rgba(90, 160, 112, 0.22)"
        : tone === "negative"
          ? "rgba(196, 99, 96, 0.2)"
          : active
            ? "rgba(83, 119, 165, 0.24)"
            : "rgba(125, 143, 166, 0.18)",
    areaBottom: "rgba(255, 255, 255, 0.02)",
  };

  if (!sparklinePoints.length) {
    return <div className="chart-empty">No balance curve for this timeframe.</div>;
  }

  const setHighlightedBalance = (index: number | null) => {
    setHighlightedIndex(index);
    const point = index === null ? null : resolvedPoints[index];
    const balance = point ? resolveBalanceValue(point) : null;
    onHighlightBalanceChange?.(balance);
  };

  const segments = sparklinePoints.slice(1).map((point, index) => {
    const event = resolvedPoints[index + 1] as BalanceEventPoint | undefined;
    const label = event ? labelBalanceEvent(event.eventType, event.eventDelta) : "Trading";
    const stroke =
      label === "Deposit"
        ? "var(--positive)"
        : label === "Withdrawal"
          ? "var(--negative)"
          : palette.stroke;

    return {
      key: `${point.x}-${point.y}-${index}`,
      stroke,
      d: buildSmoothSegmentPath(sparklinePoints, index),
    };
  });

  return (
    <div
      className="sparkline-chart-shell"
      onMouseLeave={() => setHighlightedBalance(null)}
      onTouchEnd={() => setHighlightedBalance(null)}
    >
      <svg
        className="sparkline-chart"
        viewBox={`0 0 320 ${chartHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.areaTop} />
            <stop offset="72%" stopColor="rgba(255, 255, 255, 0.04)" />
            <stop offset="100%" stopColor={palette.areaBottom} />
          </linearGradient>
        </defs>
        <path d={fillPath} fill={`url(#${gradientId})`} className="sparkline-area" />
        <path
          d={linePath}
          fill="none"
          stroke="rgba(255, 255, 255, 0.16)"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {segments.map((segment) => (
          <path
            key={segment.key}
            d={segment.d}
            fill="none"
            stroke={segment.stroke}
            strokeWidth="2.35"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={showPulseDot ? "sparkline-segment sparkline-segment--live" : "sparkline-segment"}
          />
        ))}
        {sparklinePoints.map((point, index) => (
          <circle
            key={`${point.x}-${point.y}-${index}-hit`}
            className="sparkline-hit-target"
            cx={point.x}
            cy={point.y}
            r="8"
            fill="transparent"
            stroke="none"
            tabIndex={0}
            onMouseEnter={() => setHighlightedBalance(index)}
            onFocus={() => setHighlightedBalance(index)}
            onTouchStart={() => setHighlightedBalance(index)}
            onBlur={() => setHighlightedBalance(null)}
          />
        ))}
        {currentPoint && showPulseDot ? (
          <circle
            cx={currentPoint.x}
            cy={currentPoint.y}
            r="4.2"
            fill={statusPointColor}
            stroke="rgba(255, 255, 255, 0.82)"
            strokeWidth="3"
            className="sparkline-live-dot__core"
          />
        ) : null}
        {activePoint && showActiveMarker && (!showPulseDot || activeIndex !== lastIndex) ? (
          <circle
            cx={activePoint.x}
            cy={activePoint.y}
            r="3"
            fill={statusPointColor}
            stroke="rgba(255, 255, 255, 0.52)"
            strokeWidth="1.1"
            className="sparkline-dot__active"
          />
        ) : null}
      </svg>
      {beaconStyle ? (
        <span className="sparkline-live-beacon" style={beaconStyle} aria-hidden="true">
          <span className="sparkline-live-beacon__halo" />
          <span className="sparkline-live-beacon__halo sparkline-live-beacon__halo--outer" />
        </span>
      ) : null}
    </div>
  );
}

export function BalanceEventChart({
  points,
  timeframe = "all",
  reportTimestamp,
  currentBalance,
}: {
  points: BalanceEventPoint[];
  timeframe?: Timeframe;
  reportTimestamp?: Date | string | null;
  currentBalance?: number | null;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId();

  if (!points.length) {
    return <div className="chart-empty">No balance events were captured for this timeframe.</div>;
  }

  const width = 920;
  const height = 300;
  const paddingX = 20;
  const paddingTop = 24;
  const paddingBottom = timeframe === "1d" ? 44 : 24;
  const resolvedPoints =
    timeframe === "1d"
      ? (withLivePoint(points, reportTimestamp, currentBalance) as BalanceEventPoint[])
      : points;
  const minValue = Math.min(...resolvedPoints.map((point) => point.balance));
  const maxValue = Math.max(...resolvedPoints.map((point) => point.balance));
  const range = maxValue - minValue || 1;
  const plotHeight = height - paddingTop - paddingBottom;
  const showDailyAxis = timeframe === "1d";
  const dailyAxisTicks = showDailyAxis ? Array.from({ length: 25 }, (_, index) => index) : [];
  const anchorTimestamp =
    getTimestampValue(reportTimestamp)
    ?? getTimestampValue(resolvedPoints[resolvedPoints.length - 1]?.x)
    ?? Date.now();
  const dayStart = startOfDayWindow(anchorTimestamp);
  const dayEnd = endOfDayWindow(anchorTimestamp);

  const coordinates = resolvedPoints.map((point, index) => ({
    ...point,
    xCoord:
      timeframe === "1d"
        ? paddingX + ((clamp(getTimestampValue(point.x) ?? anchorTimestamp, dayStart, dayEnd) - dayStart) / (dayEnd - dayStart)) * (width - paddingX * 2)
        : paddingX + (index / Math.max(1, resolvedPoints.length - 1)) * (width - paddingX * 2),
    yCoord: paddingTop + (1 - (point.balance - minValue) / range) * plotHeight,
  }));
  const curvePoints = coordinates.map(({ xCoord, yCoord }) => ({ x: xCoord, y: yCoord }));

  const resolvedActiveIndex = activeIndex ?? coordinates.length - 1;
  const activePoint = coordinates[resolvedActiveIndex] ?? coordinates[coordinates.length - 1];
  const balancePath = buildSmoothPath(curvePoints);

  return (
    <div className="chart-card">
      <svg
        className="detail-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Balance event chart"
        onMouseLeave={() => setActiveIndex(null)}
        onTouchEnd={() => setActiveIndex(null)}
      >
        <g className="chart-grid" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => {
            const y = paddingTop + (index / 3) * plotHeight;
            return <line key={index} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />;
          })}
          {dailyAxisTicks.map((hour) => {
            const x = paddingX + (hour / 24) * (width - paddingX * 2);
            return <line key={`x-${hour}`} x1={x} x2={x} y1={paddingTop} y2={paddingTop + plotHeight} />;
          })}
        </g>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(83, 119, 165, 0.3)" />
            <stop offset="70%" stopColor="rgba(83, 119, 165, 0.08)" />
            <stop offset="100%" stopColor="rgba(83, 119, 165, 0.01)" />
          </linearGradient>
        </defs>
        <path
          d={`${balancePath} L ${width - paddingX} ${height - paddingBottom} L ${paddingX} ${height - paddingBottom} Z`}
          fill={`url(#${gradientId})`}
          className="detail-chart-area"
        />
        <path d={balancePath} fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.slice(1).map((point, index) => {
          const label = labelBalanceEvent(point.eventType, point.eventDelta);
          const tone =
            label === "Deposit" ? "var(--positive)" : label === "Withdrawal" ? "var(--negative)" : "var(--neutral)";

          return (
            <path
              key={`${point.x}-${index}`}
              d={buildSmoothSegmentPath(curvePoints, index)}
              stroke={tone}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
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
              r={index === resolvedActiveIndex ? 7.25 : 4}
              fill={tone}
              stroke="rgba(11, 15, 27, 0.95)"
              strokeWidth={index === resolvedActiveIndex ? "2.7" : "2"}
              className={index === resolvedActiveIndex ? "detail-chart-dot--active" : undefined}
              tabIndex={0}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
            />
          );
        })}
        {showDailyAxis ? (
          <g className="chart-axis" aria-hidden="true">
            {dailyAxisTicks.map((hour) => {
              const x = paddingX + (hour / 24) * (width - paddingX * 2);
              return (
                <g key={`tick-${hour}`} transform={`translate(${x}, ${height - 16})`}>
                  {hour % 2 === 0 ? <text textAnchor="middle">{hour}</text> : null}
                </g>
              );
            })}
          </g>
        ) : null}
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

export function TradingMonitorSharedStyles() {
  return (
    <style jsx global>{`
      .chart-axis text {
        fill: rgba(255, 255, 255, 0.58);
        font-family: var(--mono);
        font-size: 12px;
        letter-spacing: 0.02em;
      }

      .detail-chart-area {
        opacity: 1;
      }

      .sparkline-area {
        opacity: 1;
      }

      .sparkline-segment--live {
        filter: drop-shadow(0 0 2px rgba(90, 160, 112, 0.2)) drop-shadow(0 0 12px rgba(90, 160, 112, 0.08));
      }

      .sparkline-chart-shell {
        position: relative;
        width: 100%;
        height: 100%;
      }

      .sparkline-live-beacon {
        position: absolute;
        pointer-events: none;
        isolation: isolate;
      }

      .sparkline-live-beacon__halo {
        position: absolute;
        left: 0;
        top: 0;
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.24;
        filter: blur(0.45px);
        animation: trading-monitor-live-halo 1.55s cubic-bezier(0.22, 1, 0.36, 1) infinite;
      }

      .sparkline-live-beacon__halo--outer {
        width: 15px;
        height: 15px;
        margin-left: -3px;
        margin-top: -3px;
        opacity: 0.12;
        animation-duration: 2.1s;
      }

      .sparkline-live-dot__core {
        filter: drop-shadow(0 0 12px rgba(90, 160, 112, 0.34));
        animation: trading-monitor-live-core 1.55s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        transform-box: fill-box;
        transform-origin: center;
      }

      .sparkline-dot__active {
        filter: drop-shadow(0 0 8px rgba(83, 119, 165, 0.28));
      }

      .detail-chart-dot--active {
        filter: drop-shadow(0 0 12px rgba(83, 119, 165, 0.22));
      }

      @keyframes trading-monitor-live-halo {
        0% {
          opacity: 0.24;
          transform: translate(-50%, -50%) scale(1);
        }
        70% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(2.6);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(2.6);
        }
      }

      @keyframes trading-monitor-live-core {
        0% {
          transform: scale(1);
        }
        35% {
          transform: scale(1.08);
        }
        100% {
          transform: scale(1);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .sparkline-live-beacon__halo,
        .sparkline-live-dot__core {
          animation: none;
        }
      }
    `}</style>
  );
}
