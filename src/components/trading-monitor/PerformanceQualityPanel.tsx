"use client";
import { memo } from "react";
import { KpiPreviewCard, useKpiHint, type KpiHintContent } from "@/components/trading-monitor/SummaryChip";

/**
 * PerformanceQualityPanel
 * ------------------------
 * Renders the three core DD-quality metrics as horizontal benchmark bars:
 *   • Sharpe Ratio
 *   • Profit Factor
 *   • Recovery Factor
 *
 * Each bar is split into 4 benchmark zones (Poor / Fair / Good / Great).
 * The portion past the current value is dimmed, a bright marker sits on the
 * value, and the readout / zone label live on their own line so nothing
 * overlaps on a narrow phone. Styling follows the dashboard's AI-Core
 * palette via design tokens in src/app/globals.css.
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
  value: number | null | undefined;
  zones: Zone[];
  scaleMax: number;
  infinityZoneIndex?: number;
  hint?: KpiHintContent;
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

interface BarSegment {
  tone: ZoneTone;
  startPct: number;
  widthPct: number;
}

function buildSegments(zones: Zone[], scaleMax: number): BarSegment[] {
  return zones.map((zone, index) => {
    const previousLimit = index === 0 ? 0 : zones[index - 1]?.limit ?? 0;
    const startPct = (Math.min(previousLimit, scaleMax) / scaleMax) * 100;
    const endPct = (Math.min(zone.limit, scaleMax) / scaleMax) * 100;
    return { tone: zone.tone, startPct, widthPct: Math.max(0, endPct - startPct) };
  });
}

function QualityBar({ config }: { config: BarConfig }) {
  const { label, value, zones, scaleMax, infinityZoneIndex, hint } = config;
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
  const markerPct = (clampedValue / scaleMax) * 100;
  const currentZone = isPositiveInfinity && infinityZoneIndex !== undefined
    ? zones[infinityZoneIndex]
    : hasValue ? pickZone(safeValue, zones) : zones[0];
  const currentColor = TONE_COLOR[currentZone.tone];
  const segments = buildSegments(zones, scaleMax);
  const dividers = zones.slice(0, -1).map((zone) => (Math.min(zone.limit, scaleMax) / scaleMax) * 100);

  const valueText = !hasValue ? "—" : isPositiveInfinity ? "∞" : safeValue.toFixed(2);

  return (
    <div
      ref={triggerRef as unknown as React.RefObject<HTMLDivElement>}
      className={`quality-bar${hint ? " quality-bar--hintable" : ""}`}
      onClick={wrapClick()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchCancel}
      onTouchEnd={handleTouchEnd}
    >
      <div className="quality-bar__head">
        <span className="quality-bar__label">{label}</span>
        <span className="quality-bar__readout">
          <span className="quality-bar__value" data-empty={!hasValue ? "true" : undefined}>
            {valueText}
          </span>
          <span className="quality-bar__tone" style={hasValue ? { color: currentColor } : undefined}>
            {hasValue ? currentZone.label : "ไม่มีข้อมูล"}
          </span>
        </span>
      </div>
      <div
        className="quality-bar__track"
        role="img"
        aria-label={`${label} ${hasValue ? `${valueText} จาก ${scaleMax}` : "ไม่มีข้อมูล"}`}
      >
        {segments.map((seg) => (
          <span
            key={seg.tone}
            className="quality-bar__seg"
            style={{
              left: `${seg.startPct}%`,
              width: `${seg.widthPct}%`,
              background: TONE_COLOR[seg.tone],
            }}
          />
        ))}
        {dividers.map((pct, index) => (
          <span key={`divider-${index}`} className="quality-bar__divider" style={{ left: `${pct}%` }} />
        ))}
        {markerPct < 100 ? (
          <span className="quality-bar__dim" style={{ left: `${markerPct}%` }} />
        ) : null}
        {hasValue ? (
          <span className="quality-bar__marker" style={{ left: `${markerPct}%` }} />
        ) : null}
      </div>
      <div className="quality-bar__scale">
        <span>0</span>
        <span>{scaleMax}</span>
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
      label: "PROFIT",
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
        <QualityBar key={config.key} config={config} />
      ))}
    </div>
  );
}

export const PerformanceQualityPanel = memo(PerformanceQualityPanelImpl);
