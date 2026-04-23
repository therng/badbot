"use client";
import { memo } from "react";

/**
 * PerformanceQualityPanel
 * ------------------------
 * Replaces the legacy DD panel chips (ABS / MAX / WIN) with three
 * zone-forward semi-circle gauges for the core DD metrics:
 *   • Sharpe Ratio
 *   • Profit Factor
 *   • Recovery Factor
 *
 * Each gauge renders a full coloured arc split into 4 benchmark zones
 * (Poor / Fair / Good / Great) with a bright needle pointing at the
 * current value and a center readout. Styling follows the dashboard's
 * AI-Core palette via design tokens in src/app/globals.css.
 */

type ZoneTone = "poor" | "fair" | "good" | "great";

interface Zone {
  readonly limit: number;
  readonly tone: ZoneTone;
  readonly label: string;
}

export interface PerformanceQualityPanelProps {
  sharpeRatio: number | null | undefined;
  profitFactor: number | null | undefined;
  recoveryFactor: number | null | undefined;
}

interface GaugeConfig {
  key: string;
  label: string;
  value: number | null | undefined;
  zones: Zone[];
  scaleMax: number;
}

// Benchmark thresholds tuned for retail FX accounts. These match the
// MQL5-style interpretations operators already use when reviewing reports.
const SHARPE_ZONES: Zone[] = [
  { limit: 1.0, tone: "poor", label: "Poor" },
  { limit: 2.0, tone: "fair", label: "Fair" },
  { limit: 3.0, tone: "good", label: "Good" },
  { limit: 4.0, tone: "great", label: "Great" },
];

const PROFIT_FACTOR_ZONES: Zone[] = [
  { limit: 1.0, tone: "poor", label: "Loss" },
  { limit: 1.5, tone: "fair", label: "Thin" },
  { limit: 2.0, tone: "good", label: "Solid" },
  { limit: 3.0, tone: "great", label: "Strong" },
];

const RECOVERY_ZONES: Zone[] = [
  { limit: 1.0, tone: "poor", label: "Weak" },
  { limit: 2.0, tone: "fair", label: "OK" },
  { limit: 4.0, tone: "good", label: "Good" },
  { limit: 6.0, tone: "great", label: "Robust" },
];

const TONE_COLOR: Record<ZoneTone, string> = {
  poor: "var(--negative)",
  fair: "var(--warning)",
  good: "var(--gold-300)",
  great: "var(--positive)",
};

const GAUGE_RADIUS = 72;
const GAUGE_STROKE = 11;
const GAUGE_WIDTH = 180;
const GAUGE_HEIGHT = 110;
const GAUGE_CENTER_X = GAUGE_WIDTH / 2;
const GAUGE_CENTER_Y = 92;

function pickZone(value: number, zones: Zone[]): Zone {
  for (const zone of zones) {
    if (value <= zone.limit) return zone;
  }
  return zones[zones.length - 1];
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// Returns an SVG arc path from startAngle to endAngle (degrees).
// Convention: 180° = left edge, 0° = right edge of the semi-circle.
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
  const sweep = startAngle > endAngle ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

function valueToAngle(value: number, scaleMax: number) {
  const frac = Math.max(0, Math.min(value, scaleMax)) / scaleMax;
  // Sweep from 180° (left) to 0° (right)
  return 180 - frac * 180;
}

interface GaugeProps {
  config: GaugeConfig;
}

function Gauge({ config }: GaugeProps) {
  const { label, value, zones, scaleMax } = config;
  const hasValue = typeof value === "number" && Number.isFinite(value);
  const safeValue = hasValue ? (value as number) : 0;
  const currentZone = hasValue ? pickZone(safeValue, zones) : zones[0];
  const currentColor = TONE_COLOR[currentZone.tone];
  const needleAngle = valueToAngle(safeValue, scaleMax);
  const needleTip = polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS + 6, needleAngle);
  const needleBase = polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS - 18, needleAngle);

  // Build one arc segment per zone, chained along the half circle.
  const arcs = zones.reduce<
    Array<{ zone: Zone; startAngle: number; endAngle: number }>
  >((segments, zone, index) => {
    const previousLimit = index === 0 ? 0 : zones[index - 1]?.limit ?? 0;
    const startFrac = Math.min(previousLimit, scaleMax) / scaleMax;
    const endFrac = Math.min(zone.limit, scaleMax) / scaleMax;
    const startAngle = 180 - startFrac * 180;
    const endAngle = 180 - endFrac * 180;
    segments.push({ zone, startAngle, endAngle });
    return segments;
  }, []);

  // Dim wash over the portion of the arc beyond the current value so the
  // reached zones visually "light up".
  const dimStartAngle = needleAngle;
  const dimEndAngle = 0;
  const showDim = hasValue && dimStartAngle > dimEndAngle;

  return (
    <div className="perf-gauge">
      <div className="perf-gauge__label">{label}</div>
      <svg
        className="perf-gauge__svg"
        viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}
        role="img"
        aria-label={`${label} gauge, ${hasValue ? safeValue.toFixed(2) : "no data"}`}
      >
        {/* Zone arcs */}
        {arcs.map(({ zone, startAngle, endAngle }) => (
          <path
            key={zone.tone}
            d={describeArc(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS, startAngle, endAngle)}
            stroke={TONE_COLOR[zone.tone]}
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="butt"
            fill="none"
            opacity={0.58}
          />
        ))}

        {/* Zone divider ticks */}
        {zones.slice(0, -1).map((zone) => {
          const frac = Math.min(zone.limit, scaleMax) / scaleMax;
          const angle = 180 - frac * 180;
          const inner = polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS - GAUGE_STROKE / 2 - 1, angle);
          const outer = polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS + GAUGE_STROKE / 2 + 1, angle);
          return (
            <line
              key={`tick-${zone.tone}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--bg-panel)"
              strokeWidth={1.4}
            />
          );
        })}

        {/* Dim wash over un-reached portion */}
        {showDim && (
          <path
            d={describeArc(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS, dimStartAngle, dimEndAngle)}
            stroke="var(--bg-panel)"
            strokeWidth={GAUGE_STROKE + 1}
            strokeLinecap="butt"
            fill="none"
            opacity={0.74}
          />
        )}

        {/* Needle */}
        {hasValue && (
          <>
            <line
              x1={needleBase.x}
              y1={needleBase.y}
              x2={needleTip.x}
              y2={needleTip.y}
              stroke="var(--text-primary)"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            <circle
              cx={needleTip.x}
              cy={needleTip.y}
              r={5}
              fill={currentColor}
              stroke="var(--text-primary)"
              strokeWidth={1.4}
            />
          </>
        )}

        {/* Scale endpoints */}
        <text
          x={GAUGE_CENTER_X - GAUGE_RADIUS - 2}
          y={GAUGE_CENTER_Y + 12}
          textAnchor="end"
          className="perf-gauge__tick"
        >
          0
        </text>
        <text
          x={GAUGE_CENTER_X + GAUGE_RADIUS + 2}
          y={GAUGE_CENTER_Y + 12}
          textAnchor="start"
          className="perf-gauge__tick"
        >
          {scaleMax}
        </text>
      </svg>
      <div className="perf-gauge__value" data-empty={!hasValue ? "true" : undefined}>
        {hasValue ? safeValue.toFixed(2) : "-"}
      </div>
      <div className="perf-gauge__tone" style={{ color: currentColor }}>
        {hasValue ? currentZone.label.toUpperCase() : "NO DATA"}
      </div>
    </div>
  );
}

function PerformanceQualityPanelImpl({
  sharpeRatio,
  profitFactor,
  recoveryFactor,
}: PerformanceQualityPanelProps) {
  const gauges: GaugeConfig[] = [
    {
      key: "sharpe",
      label: "SHARPE",
      value: sharpeRatio,
      zones: SHARPE_ZONES,
      scaleMax: 4,
    },
    {
      key: "pf",
      label: "PROFIT",
      value: profitFactor,
      zones: PROFIT_FACTOR_ZONES,
      scaleMax: 3,
    },
    {
      key: "recovery",
      label: "RECOVERY",
      value: recoveryFactor,
      zones: RECOVERY_ZONES,
      scaleMax: 6,
    },
  ];

  return (
    <section className="perf-quality-panel" aria-label="Performance quality">
      <div className="perf-quality-panel__grid">
        {gauges.map((config) => (
          <Gauge key={config.key} config={config} />
        ))}
      </div>
    </section>
  );
}

export const PerformanceQualityPanel = memo(PerformanceQualityPanelImpl);
