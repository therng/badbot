"use client";
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent as ReactTouchEvent } from "react";
import { usePathname } from "next/navigation";
import { trackKpiExpand, trackRefresh, trackTimeframeChange, trackEvent } from "@/lib/analytics";

import type {
  AccountOverviewResponse,
  BalanceDetailResponse,
  PipsSummaryResponse,
  PositionsResponse,
  ProfitDetailResponse,
  SerializedAccount,
  Timeframe,
} from "@/lib/trading/types";

import {
  formatCompactCount,
  drawdownTone,
  displayName,
  formatCompactSignedNumber,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatWholeNumber,
  type MetricTone,
  toneFromNumber,
} from "@/components/trading-monitor/formatters";

import {
  InlineState,
  SparklineChart,
  TimeframeStrip,
  TradingMonitorSharedStyles,
} from "@/components/trading-monitor/shared";
import {
  ExpandableKpiKey,
  formatCompactPercent,
  formatPlainNumberValue,
  formatPlainPercent,
  formatSignedPlainNumberValue,
  normalizeNegativeAmount,
} from "@/components/trading-monitor/DashboardFormatters";
import { SummaryChip, type KpiHintContent } from "@/components/trading-monitor/SummaryChip";
import { OpenPositionsPanel } from "@/components/trading-monitor/OpenPositionsPanel";
import { TradeHistoryPanel } from "@/components/trading-monitor/TradeHistoryPanel";
import { PipsPerformanceTable } from "@/components/trading-monitor/PipsPerformanceTable";
import { PerformanceQualityPanel } from "@/components/trading-monitor/PerformanceQualityPanel";
import { ProfitHeatmapPanel } from "@/components/trading-monitor/ProfitHeatmapPanel";
import { useApiResource } from "@/components/trading-monitor/useApiResource";
import { CandleAnimation } from "@/components/trading-monitor/LoadingScreen";

const PULL_THRESHOLD = 72;
const MAX_PULL_DISTANCE = 116;
const REFRESH_HOLD_DISTANCE = 52;
const MIN_REFRESH_VISIBLE_MS = 520;
const SPINNER_CIRCUMFERENCE = 62.83;
const EAGER_ACCOUNT_CARD_COUNT = 2;
const ACCOUNT_CARD_PRELOAD_MARGIN = "720px 360px";

function formatRatioValue(value: number | null | undefined, digits = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return formatPlainNumberValue(value, digits);
}

function formatAverageHoldTime(hours: number | null | undefined) {
  if (!Number.isFinite(hours)) {
    return "-";
  }

  const totalHours = Math.max(0, Number(hours ?? 0));
  if (totalHours < 1) {
    return `${Math.max(1, Math.round(totalHours * 60))}m`;
  }

  if (totalHours < 24) {
    return `${formatPlainNumberValue(totalHours, 1)}h`;
  }

  const days = Math.floor(totalHours / 24);
  const remainder = totalHours - days * 24;
  if (remainder < 0.1) {
    return `${days}d`;
  }

  return `${days}d ${formatPlainNumberValue(remainder, 1)}h`;
}

function marginLevelTone(value: number | null | undefined): MetricTone {
  if (!Number.isFinite(value)) {
    return "muted";
  }

  const numeric = value ?? 0;
  // No open positions → margin is 0, margin-level is undefined; show as neutral
  // so the chip doesn't read as "danger" for inactive but healthy accounts.
  if (numeric <= 0) {
    return "muted";
  }

  if (numeric <= 100) {
    return "negative";
  }

  if (numeric <= 200) {
    return "warning";
  }

  return "positive";
}

function applyPullResistance(distance: number) {
  const dampenedDistance = distance * 0.5;

  if (dampenedDistance <= PULL_THRESHOLD) {
    return dampenedDistance;
  }

  return Math.min(MAX_PULL_DISTANCE, PULL_THRESHOLD + (dampenedDistance - PULL_THRESHOLD) * 0.35);
}

const DashboardCard = memo(function DashboardCard({
  account,
  refreshKey,
  onRequestStateChange,
}: {
  account: SerializedAccount;
  refreshKey: number;
  onRequestStateChange: (request: { loading: boolean; refreshKey: number }) => void;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [highlightedBalanceState, setHighlightedBalanceState] = useState<{ scope: string; value: number | null } | null>(null);
  const [expandedKpiState, setExpandedKpiState] = useState<{ scope: string; value: ExpandableKpiKey | null } | null>(null);
  const expandedKpiScope = `${account.id}:${timeframe}`;
  const expandedKpi = expandedKpiState?.scope === expandedKpiScope ? expandedKpiState.value : null;
  const overview = useApiResource<AccountOverviewResponse>(`/api/accounts/${account.id}?timeframe=${timeframe}`, {
    refreshKey,
    onRequestStateChange,
  });
  const profitDetail = useApiResource<ProfitDetailResponse>(
    expandedKpi === "gain" ? `/api/accounts/${account.id}/profit-detail?timeframe=${timeframe}` : null,
    {
      refreshKey,
      onRequestStateChange,
    },
  );
  const balanceDetail = useApiResource<BalanceDetailResponse>(
    expandedKpi === "dd" ? `/api/accounts/${account.id}/balance-detail?timeframe=${timeframe}` : null,
    {
      refreshKey,
      onRequestStateChange,
    },
  );
  const pipsSummary = useApiResource<PipsSummaryResponse>(
    expandedKpi === "pips" ? `/api/accounts/${account.id}/pips-summary?timeframe=${timeframe}` : null,
    {
      refreshKey,
      onRequestStateChange,
    },
  );
  const positionsDetail = useApiResource<PositionsResponse>(`/api/accounts/${account.id}/positions?timeframe=${timeframe}`, {
    refreshKey,
    onRequestStateChange,
  });
  const heatmapPositions = useApiResource<PositionsResponse>(`/api/accounts/${account.id}/positions?timeframe=all`, {
    refreshKey,
    onRequestStateChange,
  });
  const accountSource = overview.data?.account ?? account;
  const active = accountSource.status === "Active";
  const highlightedBalanceScope = `${account.id}:${timeframe}:${refreshKey}:${accountSource.balance ?? ""}`;
  const highlightedBalance =
    highlightedBalanceState?.scope === highlightedBalanceScope ? highlightedBalanceState.value : null;
  const sparklinePoints = overview.data?.balanceCurve.length
    ? overview.data.balanceCurve
    : [{ x: "0", y: 0 }];
  const growthTone = toneFromNumber(overview.data?.kpis.periodGrowth);
  const gainTone = toneFromNumber(overview.data?.kpis.netProfit);
  const relativeDrawdownTone = drawdownTone(overview.data?.kpis.drawdown);
  const pipsTone = toneFromNumber(overview.data?.kpis.netPips);
  const openTone = (overview.data?.kpis.openCount ?? 0) > 0 ? "warning" : "muted";
  const accountLabel = accountSource.account_number ? `#${accountSource.account_number}` : "Unnumbered";
  const accountDisplayName = displayName(accountSource);
  const displayedBalance = highlightedBalance ?? accountSource.balance;
  const displayedGrowth = formatPercent(overview.data?.kpis.periodGrowth, 1);
  const displayedBalanceLabel = formatCurrency(displayedBalance, 2);
  const drawdownMeta = Number.isFinite(overview.data?.kpis.absoluteDrawdown)
    ? `Abs ${formatCompactNumber(overview.data?.kpis.absoluteDrawdown, 1)}`
    : undefined;
  const primaryKpiItems: Array<{
    key: string;
    expandKey?: ExpandableKpiKey;
    label: string;
    value: string;
    tone: MetricTone;
    meta?: string;
    fullValue?: string;
    hint?: KpiHintContent;
  }> = [
    {
      key: "gain",
      expandKey: "gain",
      label: "Gain",
      value: formatCompactSignedNumber(overview.data?.kpis.netProfit, 1),
      tone: gainTone,
      fullValue: formatSignedCurrency(overview.data?.kpis.netProfit, 2),
      hint: {
        title: "Net Gain",
        definition: "กำไรขาดทุนสุทธิรวม swap และ commission ในช่วงที่เลือก",
        purpose: "ดูคู่กับ DD และ timeframe เพื่อประเมินว่ากำไรมาจากทักษะหรือโชคในช่วงสั้น",
      },
    },
    {
      key: "dd",
      expandKey: "dd",
      label: "DD",
      value: formatPlainPercent(overview.data?.kpis.drawdown, 1),
      tone: relativeDrawdownTone,
      meta: drawdownMeta,
      hint: {
        title: "Relative Drawdown",
        definition: "การย่อตัวจากจุดสูงสุดถึงจุดต่ำสุด คิดเป็น %",
        purpose: "ยิ่งต่ำยิ่งดี เกณฑ์ทั่วไปคือไม่ควรเกิน 20% ใช้วัดความเสี่ยงสูงสุดของระบบ",
      },
    },
    {
      key: "pips",
      expandKey: "pips",
      label: "Pips",
      value: formatCompactSignedNumber(overview.data?.kpis.netPips, 1),
      tone: pipsTone,
      meta: "Closed",
      fullValue: `${formatSignedPlainNumberValue(overview.data?.kpis.netPips, 1)} pips`,
      hint: {
        title: "Net Pips",
        definition: "ระยะราคาสุทธิจากออเดอร์ที่ปิดแล้ว วัดเป็น pip",
        purpose: "แยกผลของ lot size ออก ช่วยเปรียบเทียบทักษะข้ามบัญชีที่มีขนาดต่างกัน",
      },
    },
    {
      key: "trades",
      expandKey: "trades",
      label: "Trades",
      value: formatCompactCount(overview.data?.kpis.trades, 1),
      tone: "warning",
      fullValue: formatWholeNumber(overview.data?.kpis.trades),
      hint: {
        title: "Total Trades",
        definition: "จำนวนออเดอร์ที่ปิดในช่วงที่เลือก",
        purpose: "ประเมินความถี่ของกลยุทธ์ — น้อยคือ swing, มากคือ scalping",
      },
    },
    {
      key: "opens",
      expandKey: "opens",
      label: "Open",
      value: formatPlainNumberValue(overview.data?.kpis.openCount, 0),
      tone: openTone,
      hint: {
        title: "Open Positions",
        definition: "จำนวน position ที่ยังเปิดอยู่",
        purpose: "บัญชีที่มี position เปิดมากมีความเสี่ยงจาก market move สูงกว่า",
      },
    },
  ];
  const EXPANDABLE_KPI_KEYS = ["gain", "dd", "pips", "trades", "opens"] as const;
  const kpiRows = [
    primaryKpiItems.filter((item) => EXPANDABLE_KPI_KEYS.includes(item.key as any)),
  ];
  const kpiItems = primaryKpiItems;
  const handleTimeframeChange = useCallback((nextTimeframe: Timeframe) => {
    trackTimeframeChange(accountDisplayName, nextTimeframe);
    setExpandedKpiState((current) =>
      current?.value ? { scope: `${account.id}:${nextTimeframe}`, value: current.value } : current,
    );
    setTimeframe(nextTimeframe);
  }, [accountDisplayName, account.id]);
  
  const openPositionSwap = positionsDetail.data?.openPositions.reduce((total, position) => total + Number(position.swap ?? 0), 0);
  const currentMargin = positionsDetail.data?.account.margin;
  const currentMarginLevel = positionsDetail.data?.account.margin_level;

  let detailState = null;
  let detailRows: Array<{
    label: string;
    value: string;
    tone: MetricTone;
    meta?: string;
    fullValue?: string;
    hint?: KpiHintContent;
  }> = [];

  switch (expandedKpi) {
    case "gain":
      detailState = profitDetail;
      detailRows = [
        {
          label: "Commission",
          value: formatCompactSignedNumber(normalizeNegativeAmount(profitDetail.data?.summary.totalCommission), 1),
          tone: toneFromNumber(normalizeNegativeAmount(profitDetail.data?.summary.totalCommission)),
          fullValue: formatSignedCurrency(normalizeNegativeAmount(profitDetail.data?.summary.totalCommission), 2),
          hint: {
            title: "Commission",
            definition: "ค่าธรรมเนียมโบรกเกอร์ต่อออเดอร์",
            purpose: "ต้นทุนจากการซื้อขาย เทรดบ่อยยิ่งสะสมมาก ควรดูสัดส่วนกับกำไรรวม",
          },
        },
        {
          label: "Swap",
          value: formatCompactSignedNumber(profitDetail.data?.summary.totalSwap, 1),
          tone: toneFromNumber(profitDetail.data?.summary.totalSwap),
          fullValue: formatSignedCurrency(profitDetail.data?.summary.totalSwap, 2),
          hint: {
            title: "Swap",
            definition: "ดอกเบี้ยถือ position ข้ามคืน",
            purpose: "สำคัญสำหรับกลยุทธ์ที่ถือ position ข้ามคืน บางคู่มี swap เป็นบวก",
          },
        },
        {
          label: "Deposits",
          value: formatCompactSignedNumber(profitDetail.data?.summary.totalDeposit, 1),
          tone: "positive",
          fullValue: formatSignedCurrency(profitDetail.data?.summary.totalDeposit, 2),
          hint: {
            title: "Total Deposits",
            definition: "เงินที่เติมเข้าบัญชีในช่วงที่เลือก",
            purpose: "แยกกำไรจริงออกจากยอดที่เพิ่มเพราะเติมเงิน ช่วยคำนวณ net return จริง",
          },
        },
        {
          label: "Withdrawals",
          value: formatCompactSignedNumber(normalizeNegativeAmount(profitDetail.data?.summary.totalWithdrawal), 1),
          tone: "warning",
          fullValue: formatSignedCurrency(normalizeNegativeAmount(profitDetail.data?.summary.totalWithdrawal), 2),
          hint: {
            title: "Total Withdrawals",
            definition: "เงินที่ถอนจากบัญชีในช่วงที่เลือก",
            purpose: "ติดตามเงินที่ถอนออก เพื่อคำนวณผลตอบแทนรวมจากบัญชี",
          },
        },
      ];
      break;
    case "dd":
      detailState = balanceDetail;
      detailRows = [
        {
          label: "ABS",
          value: formatCompactNumber(balanceDetail.data?.summary.absoluteDrawdown, 1),
          tone: drawdownTone(balanceDetail.data?.summary.absoluteDrawdown),
          meta: "Balance absolute drawdown",
          fullValue: formatCurrency(balanceDetail.data?.summary.absoluteDrawdown, 2),
          hint: {
            title: "Balance Absolute Drawdown",
            definition: "ยอดย่อตัวของ balance จากฐานเริ่มต้น",
            purpose: "บอกว่า balance เคยลงต่ำกว่าทุนเริ่มต้นมากแค่ไหน ใช้ดูว่าบัญชียังอยู่เหนือทุนหรือไม่",
          },
        },
        {
          label: "MAX",
          value: formatCompactNumber(balanceDetail.data?.summary.maximalDrawdownAmount, 1),
          tone: drawdownTone(balanceDetail.data?.summary.maximalDrawdownAmount),
          meta: "Balance maximal drawdown",
          fullValue: formatCurrency(balanceDetail.data?.summary.maximalDrawdownAmount, 2),
          hint: {
            title: "Balance Maximal Drawdown",
            definition: "DD สูงสุดจาก peak ลงถึง trough",
            purpose: "worst-case จริงที่เกิดขึ้น ใช้ตั้ง drawdown limit หรือ stop system",
          },
        },
        {
          label: "WIN",
          value: formatPlainPercent(overview.data?.kpis.winPercent, 1),
          tone: toneFromNumber(overview.data?.kpis.winPercent),
          meta: "Closed positions win rate",
          fullValue: formatPlainPercent(overview.data?.kpis.winPercent, 1),
          hint: {
            title: "Win Rate",
            definition: "สัดส่วนออเดอร์ที่ปิดเป็นกำไร",
            purpose: "ต้องดูคู่กับ risk/reward — win rate 40% ยังทำกำไรได้ถ้า RR สูงพอ",
          },
        },
      ];
      break;
    case "trades":
      detailState = positionsDetail;
      detailRows = [
        {
          label: "ACTIVITY",
          value: formatPlainPercent(positionsDetail.data?.summary.tradeActivityPercent, 1),
          tone: toneFromNumber(positionsDetail.data?.summary.tradeActivityPercent),
          meta: "Activity%",
          hint: {
            title: "Trade Activity",
            definition: "สัดส่วนวันที่มีการเทรดในช่วงที่เลือก",
            purpose: "บ่งบอกว่า account นี้ยัง active หรือเงียบลง ช่วยตรวจสอบความสม่ำเสมอ",
          },
        },
        {
          label: "TR/WK",
          value: formatRatioValue(positionsDetail.data?.summary.tradesPerWeek, 1),
          tone: toneFromNumber(positionsDetail.data?.summary.tradesPerWeek),
          meta: "Trade per week",
          hint: {
            title: "Trades per Week",
            definition: "จำนวนออเดอร์เฉลี่ยต่อสัปดาห์",
            purpose: "เปรียบเทียบ pace ของระบบ — ค่าสูงชี้ scalping, ค่าต่ำชี้ position trading",
          },
        },
        {
          label: "HOLD",
          value: formatAverageHoldTime(positionsDetail.data?.summary.averageHoldHours),
          tone: "neutral",
          meta: "Average hold time",
          hint: {
            title: "Average Hold Time",
            definition: "ระยะเวลาเฉลี่ยที่ถือ position ก่อนปิด",
            purpose: "จัดประเภทกลยุทธ์ — นาที = scalper, ชั่วโมง = day trader, วัน = swing",
          },
        },
      ];
      break;
    case "opens":
      detailState = positionsDetail;
      detailRows = [
        {
          label: "P/L",
          value: formatCompactSignedNumber(positionsDetail.data?.summary.floatingProfit, 1),
          tone: toneFromNumber(positionsDetail.data?.summary.floatingProfit),
          fullValue: formatSignedCurrency(positionsDetail.data?.summary.floatingProfit, 2),
          hint: {
            title: "Floating P/L",
            definition: "กำไร/ขาดทุนของ position ที่ยังไม่ปิด",
            purpose: "ยังไม่ใช่กำไรจริงจนกว่าจะปิด position อาจเปลี่ยนแปลงได้ตลอดเวลา",
          },
        },
        {
          label: "Swap",
          value: formatCompactSignedNumber(openPositionSwap, 1),
          tone: toneFromNumber(openPositionSwap),
          fullValue: formatSignedCurrency(openPositionSwap, 2),
          hint: {
            title: "Open Swap",
            definition: "ดอกเบี้ยค้างของ position ที่ยังเปิดอยู่",
            purpose: "ต้นทุนสะสมที่เพิ่มขึ้นทุกวัน ยิ่งถือนานยิ่งกระทบกำไรสุทธิ",
          },
        },
        {
          label: "Margin",
          value: formatCompactNumber(currentMargin, 1),
          tone: Number.isFinite(currentMargin) && (currentMargin ?? 0) > 0 ? "warning" : "muted",
          fullValue: formatCurrency(currentMargin, 2),
          hint: {
            title: "Used Margin",
            definition: "เงินค้ำประกันสำหรับ position ที่เปิดอยู่",
            purpose: "เงินที่โบรกเกอร์ lock ไว้ ยิ่งใช้มากยิ่งเสี่ยง margin call หากตลาดผิดทาง",
          },
        },
        {
          label: "Level",
          value: formatCompactPercent(currentMarginLevel, 1),
          tone: marginLevelTone(currentMarginLevel),
          fullValue: formatPlainPercent(currentMarginLevel, 1),
          hint: {
            title: "Margin Level",
            definition: "equity ÷ margin เป็น % สะท้อนความแข็งแรงของบัญชี",
            purpose: "ต่ำกว่า 100% = margin call zone ควรรักษาไว้สูงกว่า 200% เพื่อความปลอดภัย",
          },
        },
      ];
      break;
  }
  const handleChipToggle = (key: ExpandableKpiKey) => {
    setExpandedKpiState((current) => {
      const currentValue = current?.scope === expandedKpiScope ? current.value : null;
      const isSelecting = currentValue !== key;

      if (isSelecting) {
        trackKpiExpand(accountDisplayName, key);
      }

      return {
        scope: expandedKpiScope,
        value: isSelecting ? key : null,
      };
    });
  };

  let compactKpiPanel = null;
  switch (expandedKpi) {
    case "dd":
      compactKpiPanel = (
        <div className="sp-overlay-panel sp-overlay-panel--dd" role="region" aria-label="Drawdown quality">
          {balanceDetail.error ? (
            <InlineState tone="error" title="Quality metrics unavailable" message={balanceDetail.error} />
          ) : balanceDetail.loading && !balanceDetail.data ? (
            <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
          ) : (
            <PerformanceQualityPanel
              sharpeRatio={balanceDetail.data?.summary.sharpeRatio}
              profitFactor={balanceDetail.data?.summary.profitFactor}
              recoveryFactor={balanceDetail.data?.summary.recoveryFactor}
            />
          )}
          <div className="tf-row">
            <TimeframeStrip active={timeframe} onChange={handleTimeframeChange} />
          </div>
        </div>
      );
      break;
    case "pips":
      compactKpiPanel = (
        <div className="sp-overlay-panel sp-overlay-panel--pips" role="region" aria-label="Pips performance">
          {pipsSummary.error ? (
            <InlineState tone="error" title="Pips data unavailable" message={pipsSummary.error} />
          ) : pipsSummary.loading && !pipsSummary.data ? (
            <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
          ) : (
            <PipsPerformanceTable rows={pipsSummary.data?.rows ?? []} />
          )}
          <ProfitHeatmapPanel
            positions={heatmapPositions.data?.historyPositions}
            loading={heatmapPositions.loading && !heatmapPositions.data}
            error={heatmapPositions.error}
          />
        </div>
      );
      break;
    case "trades":
      compactKpiPanel = (
        <div className="sp-overlay-panel" role="region" aria-label="Trade history">
          {positionsDetail.error ? (
            <InlineState tone="error" title="Trade history unavailable" message={positionsDetail.error} />
          ) : positionsDetail.loading && !positionsDetail.data ? (
            <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
          ) : (
            <TradeHistoryPanel positions={positionsDetail.data?.historyPositions} />
          )}
        </div>
      );
      break;
    case "opens":
      compactKpiPanel = (
        <div className="sp-overlay-panel" role="region" aria-label="Open positions">
          {positionsDetail.error ? (
            <InlineState tone="error" title="Open positions unavailable" message={positionsDetail.error} />
          ) : positionsDetail.loading && !positionsDetail.data ? (
            <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
          ) : (
            <OpenPositionsPanel positions={positionsDetail.data?.openPositions} />
          )}
        </div>
      );
      break;
  }

  return (
    <article className={`card account-card ${active ? "account-card--active" : "account-card--inactive"}`}>
      <div className="sp-wrap">
        <div className="sp-header">
            <div className="sp-top sp-top--compact">
              <div className="sp-identity sp-identity--header">
              <div className="sp-name">{accountDisplayName}</div>
              <div className="sp-account">
                <span>{accountLabel}</span>
                <span
                  className={`sp-account-status ${active ? "is-active" : "is-inactive"}`}
                  aria-label={`Account status ${active ? "Active" : "Inactive"}`}
                />
              </div>
            </div>

            <div className="sp-side">
              <div
                className={`sp-growth tone-${growthTone}`}
                aria-label={`Growth ${displayedGrowth}`}
              >
                <strong>{displayedGrowth}</strong>
              </div>

              <div
                className={active && highlightedBalance === null ? "sp-balance is-current-live" : "sp-balance"}
                aria-label={`Balance ${displayedBalanceLabel}`}
              >
                <strong>{displayedBalanceLabel}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className={`sp-canvas-stack${expandedKpi === "pips" ? " sp-canvas-stack--pips" : ""}`}>
          {overview.error ? (
            <InlineState tone="error" title="Card unavailable" message={overview.error ?? "Failed to load dashboard card."} />
          ) : overview.loading && !overview.data ? (
            <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
          ) : (
            <div className="sp-canvas">
              <div className="sp-canvas__chart">
                <SparklineChart
                  points={sparklinePoints}
                  active={active}
                  tone="neutral"
                  onHighlightBalanceChange={(value) => {
                    setHighlightedBalanceState({
                      scope: highlightedBalanceScope,
                      value,
                    });
                  }}
                  timeframe={timeframe}
                  liveTimestamp={accountSource.last_updated}
                  liveBalance={accountSource.balance}
                />
              </div>
            </div>
          )}
          <div className="tf-row">
            <TimeframeStrip active={timeframe} onChange={handleTimeframeChange} />
          </div>
          {compactKpiPanel}
        </div>
      </div>

      <div className="kpi-stack">
        {kpiRows.map((row, rowIndex) => (
          <div key={`kpi-row-${rowIndex}`} className={`kgrid ${rowIndex > 0 ? "kgrid--subrow" : ""}`}>
            {row.map((item) => {
              const expandKey = item.expandKey;

              if (!expandKey) {
                return (
                  <SummaryChip
                    key={item.key}
                    label={item.label}
                    value={item.value}
                    tone={item.tone}
                    meta={item.meta}
                    fullValue={item.fullValue}
                    hint={item.hint}
                  />
                );
              }

              return (
                <SummaryChip
                  key={item.key}
                  label={item.label}
                  value={item.value}
                  tone={item.tone}
                  meta={item.meta}
                  fullValue={item.fullValue}
                  hint={item.hint}
                  onClick={() => handleChipToggle(expandKey)}
                  isSelected={expandedKpi === expandKey}
                />
              );
            })}
          </div>
        ))}
      </div>

      {expandedKpi && detailRows.length ? (
        <section className="kpi-detail-panel" aria-label={`${kpiItems.find((item) => item.key === expandedKpi)?.label ?? "KPI"} details`}>
          {detailState?.error ? (
            <InlineState tone="error" title="KPI unavailable" message={detailState.error} />
          ) : detailState?.loading && !detailState?.data ? (
            <div className="kpi-detail-grid" aria-hidden="true">
              {Array.from({ length: expandedKpi === "pips" || expandedKpi === "dd" ? 3 : 4 }, (_, index) => (
                <div key={index} className="kpi-detail-item kpi-detail-item--skeleton" />
              ))}
            </div>
          ) : (
            <div className="kpi-detail-grid">
              {detailRows.map((row) => (
                <SummaryChip
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  tone={row.tone}
                  meta={row.meta}
                  fullValue={row.fullValue}
                  hint={row.hint}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </article>
  );
});

DashboardCard.displayName = "DashboardCard";

function DeferredDashboardCard({
  account,
  onLoad,
}: {
  account: SerializedAccount;
  onLoad: () => void;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const active = account.status === "Active";
  const accountLabel = account.account_number ? `#${account.account_number}` : "Unnumbered";
  const accountDisplayName = displayName(account);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
        return;
      }

      observer.disconnect();
      onLoad();
    }, {
      root: null,
      rootMargin: ACCOUNT_CARD_PRELOAD_MARGIN,
      threshold: 0.01,
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoad]);

  return (
    <article
      ref={cardRef}
      className={`card account-card account-card--deferred ${active ? "account-card--active" : "account-card--inactive"}`}
      aria-label={`${accountDisplayName} loading`}
    >
      <div className="sp-wrap">
        <div className="sp-header">
          <div className="sp-top sp-top--compact">
            <div className="sp-identity sp-identity--header">
              <div className="sp-name">{accountDisplayName}</div>
              <div className="sp-account">
                <span>{accountLabel}</span>
                <span
                  className={`sp-account-status ${active ? "is-active" : "is-inactive"}`}
                  aria-label={`Account status ${active ? "Active" : "Inactive"}`}
                />
              </div>
            </div>

            <div className="sp-side">
              <div className="sp-growth tone-muted">
                <strong>{formatPercent(null, 1)}</strong>
              </div>
              <div className="sp-balance" aria-label={`Balance ${formatCurrency(account.balance, 2)}`}>
                <strong>{formatCurrency(account.balance, 2)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
        <div className="tf-row" aria-hidden="true">
          <div className="timeframe-strip timeframe-strip--deferred">
            {["D", "W", "M", "Y"].map((label) => (
              <span key={label} className="timeframe-pill timeframe-pill--skeleton">{label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-stack" aria-hidden="true">
        <div className="kgrid">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="kchip kchip--skeleton">
              <span className="kl">&nbsp;</span>
              <strong className="kv">&nbsp;</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function LazyDashboardCard({
  account,
  index,
  refreshKey,
  onRequestStateChange,
}: {
  account: SerializedAccount;
  index: number;
  refreshKey: number;
  onRequestStateChange: (request: { loading: boolean; refreshKey: number }) => void;
}) {
  const [shouldLoad, setShouldLoad] = useState(index < EAGER_ACCOUNT_CARD_COUNT);
  const handleLoad = useCallback(() => {
    setShouldLoad(true);
  }, []);

  if (!shouldLoad) {
    return <DeferredDashboardCard account={account} onLoad={handleLoad} />;
  }

  return (
    <DashboardCard
      account={account}
      refreshKey={refreshKey}
      onRequestStateChange={onRequestStateChange}
    />
  );
}

export default function DashboardClient() {
  const pathname = usePathname();
  const [refreshKey, setRefreshKey] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingRefreshRequests, setPendingRefreshRequests] = useState(0);
  const [hasSeenRefreshRequest, setHasSeenRefreshRequest] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullStartXRef = useRef<number | null>(null);
  const pullActiveRef = useRef(false);
  const activeRefreshKeyRef = useRef<number | null>(null);
  const refreshStartedAtRef = useRef(0);
  const refreshingRef = useRef(false);
  const resumeRefreshArmedRef = useRef(false);

  useEffect(() => {
    trackEvent("page_view", {
      page_path: pathname,
      page_title: document.title,
    });
  }, [pathname]);

  const handleRequestStateChange = useCallback(({ loading, refreshKey: requestRefreshKey }: { loading: boolean; refreshKey: number }) => {
    if (!refreshingRef.current || requestRefreshKey !== activeRefreshKeyRef.current) {
      return;
    }

    if (loading) {
      setHasSeenRefreshRequest(true);
    }

    setPendingRefreshRequests((current) => (loading ? current + 1 : Math.max(0, current - 1)));
  }, []);

  const accounts = useApiResource<SerializedAccount[]>("/api/accounts", {
    refreshKey,
    onRequestStateChange: handleRequestStateChange,
  });

  const finishPull = useCallback(() => {
    pullStartYRef.current = null;
    pullStartXRef.current = null;
    pullActiveRef.current = false;
    setIsPulling(false);
  }, []);

  const triggerRefresh = useCallback(() => {
    if (refreshingRef.current) {
      return;
    }

    const startedAt = performance.now();
    refreshingRef.current = true;
    refreshStartedAtRef.current = startedAt;
    setHasSeenRefreshRequest(false);
    setPendingRefreshRequests(0);
    setIsRefreshing(true);
    setPullDistance(REFRESH_HOLD_DISTANCE);
    setRefreshKey((current) => {
      const next = current + 1;
      activeRefreshKeyRef.current = next;
      return next;
    });
  }, []);

  const triggerResumeRefresh = useCallback(() => {
    if (refreshingRef.current) {
      return;
    }

    setRefreshKey((current) => current + 1);
  }, []);

  const retryAccountsRequest = useCallback(() => {
    if (accounts.loading) {
      return;
    }

    trackRefresh("manual");
    setRefreshKey((current) => current + 1);
  }, [accounts.loading]);

  useEffect(() => {
    const refreshOnResume = () => {
      if (!resumeRefreshArmedRef.current || document.visibilityState === "hidden") {
        return;
      }

      resumeRefreshArmedRef.current = false;
      trackRefresh("resume");
      triggerResumeRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        resumeRefreshArmedRef.current = true;
        return;
      }

      refreshOnResume();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) {
        return;
      }

      resumeRefreshArmedRef.current = true;
      refreshOnResume();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", refreshOnResume);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", refreshOnResume);
    };
  }, [triggerResumeRefresh]);

  useEffect(() => {
    if (!isRefreshing || !hasSeenRefreshRequest || pendingRefreshRequests > 0) {
      return;
    }

    const elapsed = performance.now() - refreshStartedAtRef.current;
    const timer = window.setTimeout(() => {
      refreshingRef.current = false;
      setIsRefreshing(false);
      setPullDistance(0);
    }, Math.max(0, MIN_REFRESH_VISIBLE_MS - elapsed));

    return () => window.clearTimeout(timer);
  }, [hasSeenRefreshRequest, isRefreshing, pendingRefreshRequests]);

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    // Determine the scroll position. When using document-level scrolling, window.scrollY is appropriate.
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    
    if (refreshingRef.current || scrollY > 0) {
      pullStartYRef.current = null;
      pullStartXRef.current = null;
      pullActiveRef.current = false;
      return;
    }

    pullStartYRef.current = event.touches[0]?.clientY ?? null;
    pullStartXRef.current = event.touches[0]?.clientX ?? null;
    pullActiveRef.current = false;
  }, []);

  const handleTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (refreshingRef.current) {
      return;
    }

    const startY = pullStartYRef.current;
    const startX = pullStartXRef.current;
    const currentY = event.touches[0]?.clientY;
    const currentX = event.touches[0]?.clientX;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;

    if (startY == null || startX == null || currentY == null || currentX == null) {
      return;
    }

    const delta = currentY - startY;
    const deltaX = currentX - startX;
    if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(delta)) {
      finishPull();
      if (!refreshingRef.current) {
        setPullDistance(0);
      }
      return;
    }

    if (delta <= 0 || scrollY > 0) {
      if (!pullActiveRef.current) {
        return;
      }

      finishPull();
      setPullDistance(0);
      return;
    }

    pullActiveRef.current = true;
    setIsPulling(true);
    if (event.cancelable) {
      event.preventDefault();
    }
    setPullDistance(applyPullResistance(delta));
  }, [finishPull]);

  const handleTouchEnd = useCallback(() => {
    const shouldRefresh = pullActiveRef.current && pullDistance >= PULL_THRESHOLD;
    finishPull();

    if (shouldRefresh) {
      trackRefresh("pull");
      triggerRefresh();
      return;
    }

    if (!refreshingRef.current) {
      setPullDistance(0);
    }
  }, [finishPull, pullDistance, triggerRefresh]);

  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const spinnerDashOffset = isRefreshing ? SPINNER_CIRCUMFERENCE * 0.28 : SPINNER_CIRCUMFERENCE * (1 - pullProgress * 0.72);
  const scrollStyle: CSSProperties = {
    transform: `translate3d(0, ${pullDistance}px, 0)`,
    transition: isPulling ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
  };
  return (
    <main className="monitor-page">
      <TradingMonitorSharedStyles />
      <div
        className={isRefreshing || pullDistance > 0 ? "pull-refresh is-visible" : "pull-refresh"}
        aria-hidden="true"
      >
          <div className={isRefreshing ? "pull-refresh__badge is-refreshing" : "pull-refresh__badge"}>
            <svg className="pull-refresh__spinner" viewBox="0 0 24 24" focusable="false">
              <circle className="pull-refresh__track" cx="12" cy="12" r="10" />
              <circle
                className="pull-refresh__ring"
                cx="12"
                cy="12"
                r="10"
                style={{
                  strokeDasharray: SPINNER_CIRCUMFERENCE,
                  strokeDashoffset: spinnerDashOffset,
                }}
              />
            </svg>
          </div>
        </div>
        <div
          ref={scrollRef}
          className={isRefreshing ? "app-scroll dashboard-scroll is-refreshing" : "app-scroll dashboard-scroll"}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={scrollStyle}
        >
          <section className="dashboard-section" aria-label="Trading accounts">
            {accounts.data?.length ? (
              accounts.data.map((account, index) => (
                <LazyDashboardCard
                  key={account.id}
                  account={account}
                  index={index}
                  refreshKey={refreshKey}
                  onRequestStateChange={handleRequestStateChange}
                />
              ))
            ) : null}
          </section>
        </div>
        {(accounts.loading && !accounts.data && !accounts.error) || (!accounts.loading && (!accounts.data?.length || accounts.error)) ? (
          <CandleAnimation
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          />
        ) : null}
    </main>
  );
}
