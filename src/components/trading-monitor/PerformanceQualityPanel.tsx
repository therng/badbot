"use client";
import { memo } from "react";
import { KpiPreviewCard, useKpiHint, type KpiHintContent } from "@/components/trading-monitor/SummaryChip";

/**
 * PerformanceQualityPanel
 * ------------------------
 * Renders the three core DD-quality metrics as semicircular gauges:
 *   • Sharpe Ratio
 *   • Profit Factor
 *   • Recovery Factor
 *
 * Numbers-first design: a single accent per card (Sharpe green, Profit
 * orange, Recovery blue). A dim track + accent progress arc fills to the
 * value, faint ticks mark the zone thresholds, and a small accent dot
 * sits on the arc at the value. The large accent value (with "/max") and
 * the Thai zone label own the center; the full description lives in the
 * tap hint. Styling via tokens in globals.css.
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

interface BarConfig {
  key: string;
  label: string;
  /** Single accent color for this card (number + arc + marker). */
  accent: string;
  value: number | null | undefined;
  zones: Zone[];
  scaleMax: number;
  infinityZoneIndex?: number;
  hint?: KpiHintContent;
}

// Semicircular gauge geometry (SVG user units).
const GAUGE = { cx: 100, cy: 100, r: 80, sw: 13 } as const;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function gaugePoint(frac: number, radius: number = GAUGE.r) {
  const ang = Math.PI * (1 - clamp01(frac));
  return {
    x: GAUGE.cx + radius * Math.cos(ang),
    y: GAUGE.cy - radius * Math.sin(ang),
  };
}

function arcPath(from: number, to: number, radius: number = GAUGE.r): string {
  const p0 = gaugePoint(from, radius);
  const p1 = gaugePoint(to, radius);
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

// Benchmark thresholds tuned for retail FX accounts. These match the
// MQL5-style interpretations operators already use when reviewing reports.
const SHARPE_ZONES: Zone[] = [
  { limit: 1.0, tone: "poor", label: "แย่" },
  { limit: 2.0, tone: "fair", label: "พอไหว" },
  { limit: 3.0, tone: "good", label: "เยี่ยม" },
  { limit: 4.0, tone: "great", label: "แกร่ง" },
];

const PROFIT_FACTOR_ZONES: Zone[] = [
  { limit: 1.0, tone: "poor", label: "ขาดทุน" },
  { limit: 1.5, tone: "fair", label: "เสมอตัว" },
  { limit: 2.0, tone: "good", label: "กำไรดี" },
  { limit: 3.0, tone: "great", label: "แกร่ง" },
];

const RECOVERY_ZONES: Zone[] = [
  { limit: 1.0, tone: "poor", label: "แย่" },
  { limit: 2.0, tone: "fair", label: "พอใช้" },
  { limit: 4.0, tone: "good", label: "เยี่ยม" },
  { limit: 6.0, tone: "great", label: "แกร่ง" },
];

function pickZone(value: number, zones: Zone[]): Zone {
  for (const zone of zones) {
    if (value <= zone.limit) return zone;
  }
  return zones[zones.length - 1];
}

function QualityGauge({ config }: { config: BarConfig }) {
  const { label, accent, value, zones, scaleMax, infinityZoneIndex, hint } = config;
  const {
    chipRef: triggerRef,
    sheetOpen,
    closeSheet,
    handleTouchStart,
    handleTouchMove,
    handleTouchCancel,
    handleTouchEnd,
    wrapClick,
  } = useKpiHint(Boolean(hint));

  const isPositiveInfinity = value === Number.POSITIVE_INFINITY;
  const hasValue = typeof value === "number" && (Number.isFinite(value) || isPositiveInfinity);
  const safeValue = isPositiveInfinity ? scaleMax : hasValue ? (value as number) : 0;
  const clampedValue = Math.max(0, Math.min(safeValue, scaleMax));
  const valueFrac = clampedValue / scaleMax;
  const currentZone = isPositiveInfinity && infinityZoneIndex !== undefined
    ? zones[infinityZoneIndex]
    : hasValue ? pickZone(safeValue, zones) : zones[0];

  // Graduation ticks at the zone thresholds (interior boundaries only).
  const tickFracs = zones
    .slice(0, -1)
    .map((zone) => zone.limit / scaleMax)
    .filter((f) => f > 0 && f < 1);

  const progressEnd = Math.max(valueFrac, 0.0001);
  const dot = gaugePoint(valueFrac, GAUGE.r);

  const valueText = !hasValue ? "—" : isPositiveInfinity ? "∞" : safeValue.toFixed(2);

  return (
    <div
      ref={triggerRef as unknown as React.RefObject<HTMLDivElement>}
      className={`quality-gauge${hint ? " quality-gauge--hintable" : ""}`}
      onClick={wrapClick()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchCancel}
      onTouchEnd={handleTouchEnd}
      role="img"
      aria-label={`${label} ${hasValue ? `${valueText} (${currentZone.label}) จาก ${scaleMax}` : "ไม่มีข้อมูล"}`}
    >
      <span className="quality-gauge__label">{label}</span>
      <div className="quality-gauge__dial">
        <svg className="quality-gauge__svg" viewBox="0 0 200 118" preserveAspectRatio="xMidYMin meet">
          <path
            className="quality-gauge__base"
            d={arcPath(0, 1)}
            fill="none"
            strokeWidth={GAUGE.sw}
            strokeLinecap="round"
          />
          {hasValue ? (
            <path
              className="quality-gauge__progress"
              d={arcPath(0, progressEnd)}
              fill="none"
              stroke={accent}
              strokeWidth={GAUGE.sw}
              strokeLinecap="round"
            />
          ) : null}
          {tickFracs.map((f) => {
            const inner = gaugePoint(f, GAUGE.r - GAUGE.sw / 2);
            const outer = gaugePoint(f, GAUGE.r + GAUGE.sw / 2);
            return (
              <line
                key={f}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                className="quality-gauge__tick"
                strokeWidth={2.4}
              />
            );
          })}
          {hasValue ? (
            <circle
              className="quality-gauge__dot"
              cx={dot.x}
              cy={dot.y}
              r={4.5}
              fill={accent}
            />
          ) : null}
        </svg>
        <div className="quality-gauge__center">
          <span className="quality-gauge__readout">
            <span
              className="quality-gauge__value"
              data-empty={!hasValue ? "true" : undefined}
              style={hasValue ? { color: accent } : undefined}
            >
              {valueText}
            </span>
            <span className="quality-gauge__unit">/{scaleMax}</span>
          </span>
          <span className="quality-gauge__tone" style={hasValue ? { color: accent } : undefined}>
            {hasValue ? currentZone.label : "ไม่มีข้อมูล"}
          </span>
        </div>
      </div>
      {hint && sheetOpen ? (
        <KpiPreviewCard
          hint={hint}
          label={hint.title ?? label}
          value={valueText}
          tone="neutral"
          onClose={closeSheet}
          triggerRef={triggerRef}
        />
      ) : null}
    </div>
  );
}

function PerformanceQualityPanelImpl({
  sharpeRatio,
  profitFactor,
  recoveryFactor,
}: PerformanceQualityPanelProps) {
  const bars: BarConfig[] = [
    {
      key: "sharpe",
      label: "SHARPE",
      accent: "var(--positive)",
      value: sharpeRatio,
      zones: SHARPE_ZONES,
      scaleMax: 4,
      hint: {
        title: "Sharpe Ratio",
        definition: "วัดผลตอบแทนที่ได้รับเทียบกับความเสี่ยงที่ยอมรับ  คำนวณจากกำไรเฉลี่ยหารด้วยส่วนเบี่ยงเบนมาตรฐานของผลตอบแทน ยิ่งสูงยิ่งหมายความว่าคุณรับความเสี่ยงน้อยแต่ได้ผลตอบแทนมาก",
        purpose: "ผลตอบแทน / ความเสี่ยง",
      },
    },
    {
      key: "pf",
      label: "PROFIT F.",
      accent: "var(--warning)",
      value: profitFactor,
      zones: PROFIT_FACTOR_ZONES,
      scaleMax: 3,
      infinityZoneIndex: 2,
      hint: {
        title: "Profit Factor",
        definition: "อัตราส่วนระหว่างกำไรรวมและขาดทุนรวมทุกออเดอร์ บอกว่าทุก 1 บาทที่ขาดทุน คุณได้กำไรกลับมากี่บาท ค่าต้องสูงกว่า 1.0 จึงจะทำกำไรสุทธิได้",
        purpose: "กำไร / ขาดทุน ",
      },
    },
    {
      key: "recovery",
      label: "RECOVERY",
      accent: "var(--gold-300)",
      value: recoveryFactor,
      zones: RECOVERY_ZONES,
      scaleMax: 6,
      hint: {
        title: "Recovery Factor",
        definition: "วัดความสามารถในการฟื้นตัวจากการขาดทุนสูงสุด คำนวณจากกำไรสุทธิหารด้วย Maximum Drawdown ค่าสูงแสดงว่าระบบสร้างกำไรได้มากเมื่อเทียบกับช่วงที่ขาดทุนหนักที่สุด",
        purpose: "กำไร / ดรอว์ดาวน์ ",
      },
    },
  ];

  return (
    <div className="perf-quality-panel" role="region" aria-label="Performance quality">
      {bars.map((config) => (
        <QualityGauge key={config.key} config={config} />
      ))}
    </div>
  );
}

export const PerformanceQualityPanel = memo(PerformanceQualityPanelImpl);
