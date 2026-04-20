"use client";

import { useEffect, useId, useState } from "react";

import type {
  BalanceEventPoint,
  ChartPoint,
  Timeframe,
  TradeExecutionDistribution,
} from "@/lib/trading/types";
import {
  convertBangkokReportTimeToTableTimestamp,
  endOfThaiDayInTableTimeTimestamp,
  formatTableDateLabel,
  formatTableTimeLabel,
  getTableHour,
  startOfThaiDayInTableTimeTimestamp,
  toTimestamp,
} from "@/lib/time";

import {
  TIMEFRAME_OPTIONS,
  drawdownTone,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/components/trading-monitor/formatters";

const ACCOUNT_CHART_COLOR = "var(--account-chart, #2c5d9d)";
const ACCOUNT_CHART_MUTED_COLOR = "var(--account-chart-muted, #97a3b1)";
const LAUNCH_LOADING_STEPS = ["Neural Syncing", "Predicting Trends", "Gemini Fetch", "Optimizing"] as const;
let _insightPromise: Promise<string> | null = null;
function fetchLoadingInsight(fallback: string): Promise<string> {
  _insightPromise ??= fetch("/api/loading-insight")
    .then((r) => r.json())
    .then((d: { insight?: string }) => d.insight || fallback)
    .catch(() => fallback);
  return _insightPromise;
}
const LAUNCH_TREND_TEXT = "กำลังวิเคราะห์แนวโน้ม...";
const LAUNCH_VARIANT_COPY = {
  loading: {
    core: "AI Core",
    status: "",
  },
  maintenance: {
    core: "AI Core",
    status: "Maintenance mode",
  },
  error: {
    core: "AI Core",
    status: "Error message",
  },
  empty: {
    core: "AI Core",
    status: "No account",
  },
  info: {
    core: "AI Core",
    status: "",
  },
} as const;

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

export function AnalyticLaunchScreen({
  className,
  variant = "loading",
  coreLabel,
  message,
  notice,
  status,
}: {
  className?: string;
  variant?: "loading" | "maintenance" | "error" | "empty" | "info";
  coreLabel?: string;
  message?: string;
  notice?: string;
  status?: string;
}) {
  const glowId = useId();
  const blurId = useId();
  const variantCopy = LAUNCH_VARIANT_COPY[variant];
  const isLoading = variant === "loading";
  const [loadingStep, setLoadingStep] = useState(0);
  const [insightText, setInsightText] = useState(LAUNCH_TREND_TEXT);

  useEffect(() => {
    if (!isLoading) return;
    const id = window.setInterval(() => {
      setLoadingStep((s) => (s + 1) % LAUNCH_LOADING_STEPS.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading || message) return;
    let cancelled = false;
    fetchLoadingInsight(LAUNCH_TREND_TEXT).then((text) => {
      if (!cancelled) setInsightText(text);
    });
    return () => { cancelled = true; };
  }, [isLoading, message]);

  const screenClass = ["analytic-launch-screen", `is-${variant}`, className].filter(Boolean).join(" ");
  const resolvedLabel = coreLabel ?? variantCopy.core;
  const resolvedInsight = message ?? insightText;
  const statusText = isLoading ? LAUNCH_LOADING_STEPS[loadingStep] : (status ?? variantCopy.status);
  const footerMessage = variant === "loading" ? null : (status ?? variantCopy.status) || null;

  return (
    <div className={screenClass} role={variant === "error" ? "alert" : "status"} aria-busy={isLoading}>
      <div className="als-ambient" aria-hidden="true" />

      <h1 className="als-wordmark" aria-label="Analytic">
        ANALYT
        <span className="als-wordmark-i">
          I
          <span className="als-wordmark-dot" />
        </span>
        C
      </h1>

      <div className="als-visual" aria-hidden="true">
        <svg viewBox="0 0 200 200" className="als-orbital" focusable="false">
          <defs>
            <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--launch-accent)" stopOpacity="0.55" />
              <stop offset="55%" stopColor="var(--launch-accent)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--launch-accent)" stopOpacity="0" />
            </radialGradient>
            <filter id={blurId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle cx="100" cy="100" r="88" className="als-ring als-ring--outer" />
          <circle cx="100" cy="100" r="66" className="als-ring als-ring--mid" />
          <circle cx="100" cy="100" r="44" className="als-ring als-ring--inner" />

          <line x1="10" y1="100" x2="190" y2="100" className="als-crosshair" />
          <line x1="100" y1="10" x2="100" y2="190" className="als-crosshair" />

          <g className="als-sweep">
            <path d="M100,100 L100,12 A88,88 0 0,1 188,100 Z" className="als-sweep-wake" />
            <line x1="100" y1="100" x2="100" y2="12" className="als-sweep-arm" />
          </g>

          <circle cx="100" cy="12" r="2.5" className="als-tick" />
          <circle cx="188" cy="100" r="2.5" className="als-tick als-tick--2" />
          <circle cx="100" cy="188" r="2.5" className="als-tick als-tick--3" />
          <circle cx="12" cy="100" r="2.5" className="als-tick als-tick--4" />

          <circle cx="100" cy="34" r="3" className="als-dp" />
          <circle cx="166" cy="100" r="2.5" className="als-dp als-dp--2" />
          <circle cx="46" cy="146" r="2" className="als-dp als-dp--3" />

          <circle cx="100" cy="100" r="38" fill={`url(#${glowId})`} className="als-orb-glow" />
          <circle cx="100" cy="100" r="26" className="als-orb" filter={`url(#${blurId})`} />
          <circle cx="100" cy="100" r="17" className="als-orb-core" />
          <circle cx="100" cy="100" r="4.5" className="als-orb-dot" />
        </svg>
      </div>

      <div className="als-brand">
        <span className="als-label" aria-hidden="true">{resolvedLabel}</span>
        <p className="als-insight">{`"${resolvedInsight}"`}</p>
        {notice && <p className="als-notice">{notice}</p>}
        <div className="als-scan" aria-hidden="true"><span /></div>
        <div className="als-status"><span>{statusText}</span></div>
      </div>

      <footer className="als-footer">
        <span>VERSION 4.0</span>
        {footerMessage ? <strong>{footerMessage}</strong> : null}
      </footer>
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

const EMPTY_TEXT_VALUES = new Set(["unknown", "n/a", "na", ""]);

function stripTrailingZero(value: string) {
  return value.includes(".") ? value.replace(/\.0+(?=[A-Za-z%]|$)|(\.\d*?[1-9])0+(?=[A-Za-z%]|$)/g, "$1") : value;
}

function roundHalfUp(value: number, digits = 0) {
  if (!Number.isFinite(value)) {
    return value;
  }

  const normalizedDigits = Math.max(0, digits);
  const absolute = Math.abs(value);
  const rounded = Number(`${Math.round(Number(`${absolute}e${normalizedDigits}`))}e-${normalizedDigits}`);
  return Math.sign(value) * rounded;
}

function formatRoundedNumber(value: number, digits: number, fixedDigits = false) {
  const rounded = roundHalfUp(value, digits);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fixedDigits ? digits : 0,
    maximumFractionDigits: digits,
  }).format(rounded);

  return fixedDigits ? formatted : stripTrailingZero(formatted);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return formatRoundedNumber(value ?? 0, digits);
}

function getTimestampValue(value: Date | string | null | undefined) {
  return toTimestamp(value);
}

function startOfDayWindow(timestamp: number) {
  return startOfThaiDayInTableTimeTimestamp(timestamp) ?? timestamp;
}

function endOfDayWindow(timestamp: number) {
  return endOfThaiDayInTableTimeTimestamp(timestamp) ?? (startOfDayWindow(timestamp) + 23 * 60 * 60 * 1000);
}

function resolveBalanceValue(point: ChartPoint | BalanceEventPoint) {
  const balance = (point as Partial<BalanceEventPoint>).balance;
  if (typeof balance === "number" && Number.isFinite(balance)) {
    return balance;
  }

  return Number(point.y ?? 0);
}

function formatReportLocalDate(value: Date | string | null | undefined) {
  return formatTableDateLabel(value);
}

function formatReportLocalTime(value: Date | string | null | undefined) {
  return formatTableTimeLabel(value);
}

function formatDateTime(value: Date | string | null | undefined) {
  const dateLabel = formatTableDateLabel(value);
  const timeLabel = formatTableTimeLabel(value);
  if (dateLabel === "-" || timeLabel === "-") {
    return "-";
  }

  return `${dateLabel} ${timeLabel}`;
}

function withLivePoint(
  points: Array<ChartPoint | BalanceEventPoint>,
  liveTimestamp: Date | string | null | undefined,
  liveBalance: number | null | undefined,
) {
  const timestamp = convertBangkokReportTimeToTableTimestamp(liveTimestamp);
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

  const values = points.map((point) => resolveBalanceValue(point)).filter(Number.isFinite);
  const baselineBalance = resolveBalanceValue(points[0]!);
  const maxDistanceFromBaseline = Math.max(
    0,
    ...values.map((value) => Math.abs(value - baselineBalance)),
  );
  const baselineOffset = Math.max(
    maxDistanceFromBaseline * 0.1,
    Math.abs(baselineBalance) * 0.0005,
    1,
  );
  const minimum = Math.min(baselineBalance - baselineOffset, ...values);
  const maximum = Math.max(baselineBalance + baselineOffset, ...values);
  const range = maximum - minimum || 1;
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
      y: Number((topInset + (1 - (resolveBalanceValue(point) - minimum) / range) * plotHeight).toFixed(2)),
    };
  });

  const linePath = buildSmoothPath(timelinePoints);
  const lastPoint = timelinePoints[timelinePoints.length - 1];
  const fillEndX = lastPoint?.x ?? width - horizontalInset;
  return {
    points: timelinePoints,
    linePath,
    fillPath: `${linePath} L ${fillEndX} ${height} L ${horizontalInset} ${height} Z`,
  };
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`;
  }

  const commands = [`M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)] ?? points[0]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const following = points[Math.min(points.length - 1, index + 2)] ?? next;
    const controlOneX = current.x + (next.x - previous.x) / 6;
    const controlOneY = current.y + (next.y - previous.y) / 6;
    const controlTwoX = next.x - (following.x - current.x) / 6;
    const controlTwoY = next.y - (following.y - current.y) / 6;

    commands.push(
      `C ${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)} ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)} ${next.x} ${next.y}`,
    );
  }

  return commands.join(" ");
}

function buildSmoothSegmentPath(points: Array<{ x: number; y: number }>, startIndex: number) {
  if (startIndex < 0 || startIndex >= points.length - 1) {
    return "";
  }

  const previous = points[Math.max(0, startIndex - 1)] ?? points[0];
  const current = points[startIndex];
  const next = points[startIndex + 1];
  const following = points[Math.min(points.length - 1, startIndex + 2)] ?? next;

  if (!previous || !current || !next || !following) {
    return "";
  }

  const controlOneX = current.x + (next.x - previous.x) / 6;
  const controlOneY = current.y + (next.y - previous.y) / 6;
  const controlTwoX = next.x - (following.x - current.x) / 6;
  const controlTwoY = next.y - (following.y - current.y) / 6;

  return [
    `M ${current.x} ${current.y}`,
    `C ${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)} ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)} ${next.x} ${next.y}`,
  ].join(" ");
}

function buildSparkline(values: number[], width: number, height: number) {
  if (!values.length) {
    return { linePath: "", fillPath: "", points: [] as Array<{ x: number; y: number }> };
  }

  const minimum = Math.min(...values);
  const range = Math.max(...values) - minimum || 1;
  const horizontalInset = Math.min(6, width / 24);
  const plotWidth = Math.max(width - horizontalInset * 2, 1);
  const gap = values.length > 1 ? plotWidth / (values.length - 1) : 0;
  // Keep a bit more room below the line so the curve sits slightly higher in the frame.
  const topInset = Math.min(6, height / 10);
  const bottomInset = Math.min(14, height / 4.5);
  const plotHeight = Math.max(height - topInset - bottomInset, 1);
  const points = values.map((value, index) => ({
    x: Number((horizontalInset + index * gap).toFixed(2)),
    y: Number((topInset + (1 - (value - minimum) / range) * plotHeight).toFixed(2)),
  }));
  const linePath = buildSmoothPath(points);
  const lastPoint = points[points.length - 1];
  const fillEndX = lastPoint?.x ?? width - horizontalInset;

  return {
    points,
    linePath,
    fillPath: `${linePath} L ${fillEndX} ${height} L ${horizontalInset} ${height} Z`,
  };
}

function buildEmptyTradeExecutionDistribution(): TradeExecutionDistribution {
  return {
    reportDate: "-",
    reportTimestamp: "",
    timezoneBasis: "report-local",
    totalExecutions: 0,
    buyExecutions: 0,
    sellExecutions: 0,
    excludedOutsideReportDate: 0,
    excludedFutureSkew: 0,
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      totalExecutions: 0,
      buyExecutions: 0,
      sellExecutions: 0,
      totalVolume: 0,
      totalProfit: 0,
    })),
  };
}

function formatExecutionHourRange(hour: number) {
  const normalized = Math.max(0, Math.min(23, hour));
  return `${String(normalized).padStart(2, "0")}:00-${String(normalized).padStart(2, "0")}:59`;
}

function labelBalanceEvent(type: string | null | undefined, delta: number | null | undefined) {
  if ((type ?? "").toLowerCase().includes("balance")) {
    if ((delta ?? 0) > 0) {
      return "Deposit";
    }

    if ((delta ?? 0) < 0) {
      return "Withdrawal";
    }

    return "Balance";
  }

  return type || "Trading";
}

export function SparklineChart({
  points,
  active,
  tone = "neutral",
  onHighlightBalanceChange,
  timeframe = "1d",
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
  const activeDataPoint = resolvedPoints[activeIndex] ?? resolvedPoints[lastIndex];
  const currentDotColor = ACCOUNT_CHART_COLOR;
  const currentBeaconColor = ACCOUNT_CHART_COLOR;
  const statusPointColor = active ? currentBeaconColor : ACCOUNT_CHART_MUTED_COLOR;
  const showActiveMarker = Boolean(activePoint);
  const showCurrentDot = active && Boolean(currentPoint);
  const beaconStyle =
    currentPoint && showCurrentDot
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
        ? "rgba(90, 160, 112, 0.18)"
        : tone === "negative"
          ? "rgba(196, 99, 96, 0.17)"
          : active
            ? "rgba(44, 93, 157, 0.32)"
            : "rgba(83, 119, 165, 0.2)",
    areaMid:
      tone === "positive"
        ? "rgba(90, 160, 112, 0.08)"
        : tone === "negative"
          ? "rgba(196, 99, 96, 0.07)"
          : active
            ? "rgba(44, 93, 157, 0.14)"
            : "rgba(83, 119, 165, 0.08)",
    areaBottom:
      tone === "positive"
        ? "rgba(90, 160, 112, 0.02)"
        : tone === "negative"
          ? "rgba(196, 99, 96, 0.02)"
          : "rgba(44, 93, 157, 0.03)",
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
  const handleActivatePoint = (index: number, toggle = false) => {
    if (toggle && highlightedIndex === index) {
      setHighlightedBalance(null);
      return;
    }

    setHighlightedBalance(index);
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
      onMouseLeave={() => {
        if (timeframe !== "1d") {
          setHighlightedBalance(null);
        }
      }}
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
            <stop offset="72%" stopColor={palette.areaMid} />
            <stop offset="100%" stopColor={palette.areaBottom} />
          </linearGradient>
        </defs>
        <path d={fillPath} fill={`url(#${gradientId})`} className="sparkline-area" />
        <path
          d={linePath}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="3.1"
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
            className="sparkline-segment"
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
            onMouseEnter={() => {
              if (timeframe !== "1d") {
                setHighlightedBalance(index);
              }
            }}
            onFocus={() => setHighlightedBalance(index)}
            onClick={() => handleActivatePoint(index, timeframe === "1d")}
            onTouchStart={(event) => {
              event.preventDefault();
              handleActivatePoint(index, true);
            }}
            onBlur={() => {
              if (timeframe !== "1d") {
                setHighlightedBalance(null);
              }
            }}
          />
        ))}
        {currentPoint && showCurrentDot ? (
          <circle
            cx={currentPoint.x}
            cy={currentPoint.y}
            r="2"
            fill={currentDotColor}
            className="sparkline-live-dot__core"
          />
        ) : null}
        {activePoint && showActiveMarker && (!showCurrentDot || activeIndex !== lastIndex) ? (
          <circle
            cx={activePoint.x}
            cy={activePoint.y}
            r="2"
            fill={currentDotColor}
            stroke="rgba(255, 255, 255, 0.52)"
            strokeWidth="1.1"
            className="sparkline-dot__active"
          />
        ) : null}
      </svg>
      {beaconStyle ? (
        <span className="sparkline-live-beacon" style={beaconStyle} aria-hidden="true">
          <span className="sparkline-live-beacon__ambient" />
          <span className="sparkline-live-beacon__pulse sparkline-live-beacon__pulse--one" />
          <span className="sparkline-live-beacon__pulse sparkline-live-beacon__pulse--two" />
        </span>
      ) : null}
      {timeframe === "1d" && highlightedIndex !== null && activeDataPoint ? (
        <div className="sparkline-tooltip sparkline-tooltip--inset" role="status" aria-live="polite">
          <span>{formatReportLocalDate(activeDataPoint.x)}</span>
          <strong>{formatReportLocalTime(activeDataPoint.x)}</strong>
          <span>{formatCurrency(resolveBalanceValue(activeDataPoint))}</span>
        </div>
      ) : null}
    </div>
  );
}

export function TradeExecutionsChart({
  distribution,
}: {
  distribution: TradeExecutionDistribution | null | undefined;
}) {
  const [activeHour, setActiveHour] = useState<number | null>(null);
  const gradientId = useId();
  const currentDotColor = ACCOUNT_CHART_COLOR;
  const width = 320;
  const height = 132;
  const paddingX = 10;
  const paddingTop = 10;
  const paddingBottom = 10;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingTop - paddingBottom;
  const baselineY = paddingTop + plotHeight;
  const slotWidth = plotWidth / Math.max(1, 24);
  const resolvedDistribution = distribution ?? buildEmptyTradeExecutionDistribution();
  const buckets = resolvedDistribution.hourly.length === 24
    ? resolvedDistribution.hourly
    : buildEmptyTradeExecutionDistribution().hourly;
  const peakExecutions = Math.max(1, ...buckets.map((bucket) => bucket.totalExecutions));
  const hasExecutions = resolvedDistribution.totalExecutions > 0;
  const points = buckets.map((bucket, index) => ({
    bucket,
    x: paddingX + (index / Math.max(1, buckets.length - 1)) * plotWidth,
    y: baselineY - (bucket.totalExecutions / peakExecutions) * plotHeight,
  }));
  const areaPath = points.length
    ? `${buildSmoothPath(points.map(({ x, y }) => ({ x, y })))} L ${points[points.length - 1]?.x ?? width - paddingX} ${baselineY} L ${points[0]?.x ?? paddingX} ${baselineY} Z`
    : "";
  const linePath = buildSmoothPath(points.map(({ x, y }) => ({ x, y })));
  const defaultActiveIndex = buckets.reduce((bestIndex, bucket, index, source) => (
    bucket.totalExecutions > (source[bestIndex]?.totalExecutions ?? -1) ? index : bestIndex
  ), 0);
  const resolvedActiveIndex = activeHour ?? defaultActiveIndex;
  const activePoint = points[resolvedActiveIndex] ?? points[0];
  const focusBeaconStyle = hasExecutions && activePoint
    ? {
        left: `${(activePoint.x / width) * 100}%`,
        top: `${(activePoint.y / height) * 100}%`,
        color: currentDotColor,
      }
    : null;

  return (
    <div className="trade-executions-chart">
      <div
        className="trade-executions-chart__figure"
        onMouseLeave={() => setActiveHour(null)}
        onTouchEnd={() => setActiveHour(null)}
      >
        <svg
          className="trade-executions-chart__svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Trade executions by hour"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(44, 93, 157, 0.28)" />
              <stop offset="70%" stopColor="rgba(44, 93, 157, 0.08)" />
              <stop offset="100%" stopColor="rgba(44, 93, 157, 0.01)" />
            </linearGradient>
          </defs>
          <g className="trade-executions-chart__grid" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => {
              const y = paddingTop + (index / 3) * plotHeight;
              return <line key={`y-${index}`} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />;
            })}
            {Array.from({ length: 25 }, (_, index) => {
              const x = paddingX + index * slotWidth;
              return <line key={`x-${index}`} x1={x} x2={x} y1={paddingTop} y2={baselineY} />;
            })}
          </g>
          {linePath ? (
            <>
              <path d={areaPath} fill={`url(#${gradientId})`} className="trade-executions-chart__area" />
              <path
                d={linePath}
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={linePath}
                fill="none"
                stroke="var(--account-chart)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="trade-executions-chart__line"
              />
            </>
          ) : null}
          {hasExecutions && activePoint ? (
            <g aria-hidden="true">
              <line
                className="trade-executions-chart__focus-line"
                x1={activePoint.x}
                x2={activePoint.x}
                y1={paddingTop}
                y2={baselineY}
              />
              <circle
                className="trade-executions-chart__focus-dot"
                cx={activePoint.x}
                cy={activePoint.y}
                r="4.2"
              />
            </g>
          ) : null}
          <g>
            {buckets.map((bucket, index) => {
              const x = paddingX + index * slotWidth;
              return (
                <rect
                  key={`hit-${bucket.hour}`}
                  className="trade-executions-chart__hit"
                  x={x}
                  y={paddingTop}
                  width={slotWidth}
                  height={plotHeight}
                  tabIndex={0}
                  aria-label={`${formatExecutionHourRange(bucket.hour)}: ${bucket.totalExecutions} executions`}
                  onMouseEnter={() => setActiveHour(index)}
                  onFocus={() => setActiveHour(index)}
                  onTouchStart={() => setActiveHour(index)}
                  onBlur={() => setActiveHour(null)}
                />
              );
            })}
          </g>
        </svg>
        {focusBeaconStyle ? (
          <span className="sparkline-live-beacon trade-executions-chart__focus-beacon" style={focusBeaconStyle} aria-hidden="true">
            <span className="sparkline-live-beacon__ambient" />
            <span className="sparkline-live-beacon__pulse sparkline-live-beacon__pulse--one" />
            <span className="sparkline-live-beacon__pulse sparkline-live-beacon__pulse--two" />
          </span>
        ) : null}
        {!hasExecutions ? (
          <div className="trade-executions-chart__empty">No trade executions for selected date</div>
        ) : null}
      </div>
    </div>
  );
}

export function BalanceEventChart({
  points,
  timeframe = "1d",
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
  const anchorTimestamp =
    getTimestampValue(reportTimestamp)
    ?? getTimestampValue(resolvedPoints[resolvedPoints.length - 1]?.x)
    ?? getTimestampValue(resolvedPoints[0]?.x)
    ?? 0;
  const dayStart = startOfDayWindow(anchorTimestamp);
  const dayEnd = endOfDayWindow(anchorTimestamp);
  const axisStartHour = getTableHour(dayStart) ?? 0;
  const dailyAxisTicks = showDailyAxis
    ? Array.from({ length: 24 }, (_, index) => ({
        hour: (axisStartHour + index) % 24,
        index,
      }))
    : [];

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
          {dailyAxisTicks.map(({ hour, index }) => {
            const x = paddingX + (index / 23) * (width - paddingX * 2);
            return <line key={`x-${hour}`} x1={x} x2={x} y1={paddingTop} y2={paddingTop + plotHeight} />;
          })}
        </g>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(44, 93, 157, 0.44)" />
            <stop offset="70%" stopColor="rgba(44, 93, 157, 0.16)" />
            <stop offset="100%" stopColor="rgba(44, 93, 157, 0.04)" />
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
          return (
            <circle
              key={`${point.x}-${index}-dot`}
              cx={point.xCoord}
              cy={point.yCoord}
              r={index === resolvedActiveIndex ? 7.25 : 4}
              fill={ACCOUNT_CHART_COLOR}
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
              const x = paddingX + (hour.index / 23) * (width - paddingX * 2);
              return (
                <g key={`tick-${hour.hour}`} transform={`translate(${x}, ${height - 16})`}>
                  {hour.index % 2 === 0 ? <text textAnchor="middle">{hour.hour}</text> : null}
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
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.02em;
      }

      .detail-chart-area {
        opacity: 1;
      }

      .sparkline-area {
        opacity: 1;
      }

      .sparkline-chart-shell {
        position: relative;
        width: 100%;
        height: 100%;
      }

      .sparkline-live-beacon {
        --core-size: 8px;
        --pulse-base-size: 14px;
        --max-scale: 2.8;
        --pulse-duration: 3.2s;
        --pulse-delay: 1.6s;
        --stroke-color: rgba(255, 255, 255, 0.76);
        --fill-color: rgba(255, 255, 255, 0.16);
        --bg-glow: rgba(255, 255, 255, 0.1);
        --shadow-glow: rgba(255, 255, 255, 0.25);
        --stroke-color: color-mix(in srgb, currentColor 76%, white 24%);
        --fill-color: color-mix(in srgb, currentColor 16%, transparent);
        --bg-glow: color-mix(in srgb, currentColor 10%, transparent);
        --shadow-glow: color-mix(in srgb, currentColor 25%, transparent);
        position: absolute;
        pointer-events: none;
        isolation: isolate;
        width: 0;
        height: 0;
      }

      .sparkline-tooltip {
        position: absolute;
        z-index: 3;
        display: grid;
        gap: 2px;
        min-width: 112px;
        padding: 8px 10px;
        border: 1px solid rgba(114, 133, 153, 0.28);
        border-radius: 10px;
        background: rgba(7, 11, 15, 0.94);
        box-shadow: 0 14px 28px rgba(0, 0, 0, 0.24);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        pointer-events: none;
      }

      .sparkline-tooltip--inset {
        top: 10px;
        right: 10px;
        min-width: 124px;
        transform: none;
      }

      .sparkline-tooltip strong {
        color: var(--text);
        font-size: 13px;
        line-height: 1.1;
      }

      .sparkline-tooltip span {
        color: var(--text-muted);
        font-size: 10px;
        line-height: 1.2;
        letter-spacing: 0.04em;
        font-family: var(--font-mono);
      }

      .sparkline-live-beacon__ambient {
        position: absolute;
        left: 0;
        top: 0;
        width: 18px;
        height: 18px;
        transform: translate(-50%, -50%);
        border-radius: 999px;
        background: var(--bg-glow);
        box-shadow: 0 0 14px var(--shadow-glow);
        z-index: -1;
      }

      .sparkline-live-beacon__pulse {
        position: absolute;
        left: 0;
        top: 0;
        width: var(--pulse-base-size);
        height: var(--pulse-base-size);
        transform: translate(-50%, -50%) scale(1);
        transform-origin: center;
        border-radius: 999px;
        background: var(--fill-color);
        border: 1px solid var(--stroke-color);
        opacity: 0;
      }

      .sparkline-live-beacon__pulse--one {
        animation: trading-monitor-pulse-ring var(--pulse-duration) ease-out infinite;
      }

      .sparkline-live-beacon__pulse--two {
        animation: trading-monitor-pulse-ring var(--pulse-duration) ease-out var(--pulse-delay) infinite;
      }

      .sparkline-live-dot__core {
        filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.42));
        filter: drop-shadow(0 0 8px color-mix(in srgb, currentColor 80%, transparent));
      }

      .sparkline-dot__active {
        filter: none;
      }

      .detail-chart-dot--active {
        filter: drop-shadow(0 0 12px rgba(83, 119, 165, 0.22));
      }

      .trade-executions-chart {
        width: 100%;
        height: 100%;
      }

      .trade-executions-chart__figure {
        position: relative;
        width: 100%;
        min-height: 0;
        height: 100%;
      }

      .trade-executions-chart__svg {
        width: 100%;
        height: 100%;
        overflow: visible;
      }

      .trade-executions-chart__grid line {
        stroke: rgba(92, 82, 62, 0.1);
        stroke-width: 1;
      }

      .trade-executions-chart__area {
        opacity: 1;
      }

      .trade-executions-chart__line {
        filter: drop-shadow(0 8px 18px rgba(44, 93, 157, 0.12));
      }

      .trade-executions-chart__focus-line {
        stroke: rgba(44, 93, 157, 0.2);
        stroke-width: 1.2;
        stroke-dasharray: 4 6;
      }

      .trade-executions-chart__focus-dot {
        fill: var(--account-chart, #2c5d9d);
        stroke: rgba(255, 255, 255, 0.76);
        stroke-width: 1.5;
        filter: drop-shadow(0 0 8px rgba(44, 93, 157, 0.38));
        filter: drop-shadow(0 0 8px color-mix(in srgb, var(--account-chart, #2c5d9d) 80%, transparent));
      }

      .trade-executions-chart__hit {
        fill: transparent;
        cursor: pointer;
      }

      .trade-executions-chart__empty {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 20px 18px;
        text-align: center;
        color: var(--account-muted);
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 600;
      }

      @keyframes trading-monitor-pulse-ring {
        0% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0;
        }
        5% {
          opacity: 1;
        }
        45%,
        100% {
          transform: translate(-50%, -50%) scale(var(--max-scale));
          opacity: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .sparkline-live-beacon__pulse {
          animation: none;
          opacity: 0;
        }
      }
    `}</style>
  );
}
