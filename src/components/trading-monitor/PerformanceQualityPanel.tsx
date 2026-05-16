"use client";
import { memo } from "react";
import { KpiPreviewCard, useKpiHint, type KpiHintContent } from "@/components/trading-monitor/SummaryChip";

/**
 * PerformanceQualityPanel
 * ------------------------
 * Renders the three core DD-quality metrics as circular radial bars:
 *   • Sharpe Ratio
 *   • Profit Factor
 *   • Recovery Factor
 *
 * Each metric is a 270° radial bar over a faint track. The value arc is
 * stroked with a gradient running from the lower benchmark zone color into
 * the active zone color (Poor / Fair / Good / Great), tipped with a glowing
 * knob, with the bold value and zone label centered. Styling follows the
 * dashboard's AI-Core palette via design tokens in src/app/globals.css.
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
  subtitle: string;
  value: number | null | undefined;
  zones: Zone[];
  scaleMax: number;
  infinityZoneIndex?: number;
  hint?: KpiHintContent;
}

// Circular radial-bar geometry (SVG user units). A 270° sweep starting at
// the lower-left, leaving a 90° gap at the bottom.
const GAUGE = { cx: 100, cy: 100, r: 78, sw: 14 } as const;
const START_DEG = 135;
const SWEEP_DEG = 270;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function gaugePoint(frac: number, radius: number = GAUGE.r) {
  const rad = ((START_DEG + clamp01(frac) * SWEEP_DEG) * Math.PI) / 180;
  return {
    x: GAUGE.cx + radius * Math.cos(rad),
    y: GAUGE.cy + radius * Math.sin(rad),
  };
}

function arcPath(from: number, to: number, radius: number = GAUGE.r): string {
  const a = clamp01(from);
  const b = clamp01(to);
  const p0 = gaugePoint(a, radius);
  const p1 = gaugePoint(b, radius);
  const largeArc = (b - a) * SWEEP_DEG > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
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

const TONE_COLOR: Record<ZoneTone, string> = {
  poor: "var(--negative)",
  fair: "var(--warning)",
  good: "var(--gold-300)",
  great: "var(--positive)",
};

function pickZone(value: number, zones: Zone[]): Zone {
  for (const zone of zones) {
    if (value <= zone.limit) return zone;
  }
  return zones[zones.length - 1];
}

function QualityGauge({ config }: { config: BarConfig }) {
  const { label, subtitle, value, zones, scaleMax, infinityZoneIndex, hint } = config;
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
  const currentColor = TONE_COLOR[currentZone.tone];

  const currentIndex = zones.indexOf(currentZone);
  // Gradient runs from the lower benchmark zone color into the active zone
  // color, so the fill itself reads Poor → Great.
  const gradFrom = TONE_COLOR[zones[Math.max(0, currentIndex - 1)].tone];
  const gradTo = currentColor;
  const gradId = `qg-grad-${config.key}`;

  const arcStart = gaugePoint(0);
  const knob = gaugePoint(valueFrac, GAUGE.r);

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
        <svg className="quality-gauge__svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient
              id={gradId}
              gradientUnits="userSpaceOnUse"
              x1={arcStart.x}
              y1={arcStart.y}
              x2={knob.x}
              y2={knob.y}
            >
              <stop offset="0%" stopColor={gradFrom} />
              <stop offset="100%" stopColor={gradTo} />
            </linearGradient>
          </defs>
          <path
            className="quality-gauge__base"
            d={arcPath(0, 1)}
            fill="none"
            strokeWidth={GAUGE.sw}
            strokeLinecap="round"
          />
          {hasValue && valueFrac > 0 ? (
            <>
              <path
                className="quality-gauge__value-arc"
                d={arcPath(0, valueFrac)}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={GAUGE.sw}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 6px ${currentColor})` }}
              />
              <circle
                className="quality-gauge__knob"
                cx={knob.x}
                cy={knob.y}
                r={GAUGE.sw / 2 + 1}
                fill={currentColor}
                stroke="#fff"
                strokeWidth={2}
              />
            </>
          ) : null}
        </svg>
        <div className="quality-gauge__center">
          <span
            className="quality-gauge__value"
            data-empty={!hasValue ? "true" : undefined}
            style={hasValue ? { color: currentColor } : undefined}
          >
            {valueText}
          </span>
          <span className="quality-gauge__tone" style={hasValue ? { color: currentColor } : undefined}>
            {hasValue ? currentZone.label : "ไม่มีข้อมูล"}
          </span>
          <span className="quality-gauge__scale">0 – {scaleMax}</span>
        </div>
      </div>
      <span className="quality-gauge__subtitle">{subtitle}</span>
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
      subtitle: "ผลตอบแทนปรับด้วยความเสี่ยง",
      value: sharpeRatio,
      zones: SHARPE_ZONES,
      scaleMax: 4,
      hint: {
        title: "Sharpe Ratio",
        definition: "วัดผลตอบแทนที่ได้รับเทียบกับความเสี่ยงที่ยอมรับ คำนวณจากกำไรเฉลี่ยหารด้วยส่วนเบี่ยงเบนมาตรฐานของผลตอบแทน ยิ่งสูงยิ่งหมายความว่าคุณรับความเสี่ยงน้อยแต่ได้ผลตอบแทนมาก",
        purpose: "< 1 = ต่ำ · 1–2 = พอใช้ · 2–3 = ดี · > 3 = ยอดเยี่ยม",
      },
    },
    {
      key: "pf",
      label: "PROFIT F.",
      subtitle: "กำไรรวม / ขาดทุนรวม",
      value: profitFactor,
      zones: PROFIT_FACTOR_ZONES,
      scaleMax: 3,
      infinityZoneIndex: 2,
      hint: {
        title: "Profit Factor",
        definition: "อัตราส่วนระหว่างกำไรรวมและขาดทุนรวมทุกออเดอร์ บอกว่าทุก 1 บาทที่ขาดทุน คุณได้กำไรกลับมากี่บาท ค่าต้องสูงกว่า 1.0 จึงจะทำกำไรสุทธิได้",
        purpose: "< 1 = ขาดทุน · 1–1.5 = เสมอตัว · 1.5–2 = ดี · > 2 = แข็งแกร่ง",
      },
    },
    {
      key: "recovery",
      label: "RECOVERY",
      subtitle: "กำไรสุทธิ / ดรอว์ดาวน์สูงสุด",
      value: recoveryFactor,
      zones: RECOVERY_ZONES,
      scaleMax: 6,
      hint: {
        title: "Recovery Factor",
        definition: "วัดความสามารถในการฟื้นตัวจากการขาดทุนสูงสุด คำนวณจากกำไรสุทธิหารด้วย Maximum Drawdown ค่าสูงแสดงว่าระบบสร้างกำไรได้มากเมื่อเทียบกับช่วงที่ขาดทุนหนักที่สุด",
        purpose: "< 1 = อ่อนแอ · 1–2 = พอใช้ · 2–4 = ดี · > 4 = แข็งแกร่ง",
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
