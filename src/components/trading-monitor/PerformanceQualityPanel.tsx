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
 * Each gauge is a 4-zone benchmark arc (Poor / Fair / Good / Great) with
 * the active zone highlighted, a pin marking the value on the arc, and a
 * bold zone-colored value plus subtitle at the center. Styling follows the
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

  // One arc segment per zone, with a small angular gap between zones.
  const GAP = 0.009;
  const segments = zones.map((zone, index) => {
    const rawStart = (index === 0 ? 0 : zones[index - 1].limit) / scaleMax;
    const rawEnd = Math.min(zone.limit, scaleMax) / scaleMax;
    const start = clamp01(index === 0 ? rawStart : rawStart + GAP);
    const end = clamp01(index === zones.length - 1 ? rawEnd : rawEnd - GAP);
    return { tone: zone.tone, d: arcPath(start, Math.max(start, end)) };
  });

  const knobOnArc = gaugePoint(valueFrac, GAUGE.r);
  const knobOuter = gaugePoint(valueFrac, GAUGE.r + 13);

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
          {segments.map((seg) => (
            <path
              key={seg.tone}
              d={seg.d}
              fill="none"
              stroke={TONE_COLOR[seg.tone]}
              strokeWidth={GAUGE.sw}
              strokeLinecap="round"
              opacity={hasValue ? (seg.tone === currentZone.tone ? 1 : 0.4) : 0.32}
            />
          ))}
          {hasValue ? (
            <g className="quality-gauge__needle">
              <line
                x1={knobOnArc.x}
                y1={knobOnArc.y}
                x2={knobOuter.x}
                y2={knobOuter.y}
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <circle cx={knobOuter.x} cy={knobOuter.y} r={6.5} fill={currentColor} stroke="#fff" strokeWidth={2} />
            </g>
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
        </div>
        <span className="quality-gauge__min">0</span>
        <span className="quality-gauge__max">{scaleMax}</span>
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
