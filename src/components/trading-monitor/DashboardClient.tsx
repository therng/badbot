"use client";
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent as ReactTouchEvent } from "react";
import { usePathname } from "next/navigation";
import { trackAccountSwipe, trackKpiExpand, trackRefresh, trackTimeframeChange, trackEvent } from "@/lib/analytics";

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
  AccountsUnavailableState,
  InlineState,
  SparklineChart,
  TimeframeStrip,
  TradingMonitorSharedStyles,
} from "@/components/trading-monitor/shared";
import {
  ExpandableKpiKey,
  formatPlainNumberValue,
  formatPlainPercent,
  formatSignedPlainNumberValue,
  normalizeNegativeAmount,
} from "@/components/trading-monitor/DashboardFormatters";
import { SummaryChip } from "@/components/trading-monitor/SummaryChip";
import { OpenPositionsPanel } from "@/components/trading-monitor/OpenPositionsPanel";
import { TradeHistoryPanel } from "@/components/trading-monitor/TradeHistoryPanel";
import { PipsPerformanceTable } from "@/components/trading-monitor/PipsPerformanceTable";
import { useApiResource } from "@/components/trading-monitor/useApiResource";

const PULL_THRESHOLD = 72;
const MAX_PULL_DISTANCE = 116;
const REFRESH_HOLD_DISTANCE = 52;
const MIN_REFRESH_VISIBLE_MS = 520;
const SPINNER_CIRCUMFERENCE = 62.83;
const EAGER_ACCOUNT_CARD_COUNT = 2;
const ACCOUNT_CARD_PRELOAD_MARGIN = "720px 360px";

function scrollElementToLeft(element: HTMLElement, left: number, behavior: ScrollBehavior = "smooth") {
  element.scrollTo({
    left,
    top: 0,
    behavior,
  });
}

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
  const positionsDetail = useApiResource<PositionsResponse>(
    expandedKpi === "opens" || expandedKpi === "trades"
      ? `/api/accounts/${account.id}/positions?timeframe=${timeframe}`
      : null,
    {
      refreshKey,
      onRequestStateChange,
    },
  );
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
  }> = [
    {
      key: "gain",
      expandKey: "gain",
      label: "Gain",
      value: formatCompactSignedNumber(overview.data?.kpis.netProfit, 1),
      tone: gainTone,
      fullValue: formatSignedCurrency(overview.data?.kpis.netProfit, 2),
    },
    {
      key: "dd",
      expandKey: "dd",
      label: "DD",
      value: formatPlainPercent(overview.data?.kpis.drawdown, 1),
      tone: relativeDrawdownTone,
      meta: drawdownMeta,
    },
    {
      key: "pips",
      expandKey: "pips",
      label: "Pips",
      value: formatCompactSignedNumber(overview.data?.kpis.netPips, 1),
      tone: pipsTone,
      meta: "Closed",
      fullValue: `${formatSignedPlainNumberValue(overview.data?.kpis.netPips, 1)} pips`,
    },
    {
      key: "trades",
      expandKey: "trades",
      label: "Trades",
      value: formatCompactCount(overview.data?.kpis.trades, 1),
      tone: "warning",
      fullValue: formatWholeNumber(overview.data?.kpis.trades),
    },
    {
      key: "opens",
      expandKey: "opens",
      label: "Open",
      value: formatPlainNumberValue(overview.data?.kpis.openCount, 0),
      tone: openTone,
    },
  ];
  const kpiRows = [
    primaryKpiItems.filter((item) => ["gain", "dd", "pips", "trades", "opens"].includes(item.key)),
  ];
  const kpiItems = primaryKpiItems;
  const detailState =
    expandedKpi === "gain"
      ? profitDetail
      : expandedKpi === "dd"
        ? balanceDetail
        : expandedKpi === "opens" || expandedKpi === "trades"
            ? positionsDetail
            : null;
  const isOpensExpanded = expandedKpi === "opens";
  const isTradesExpanded = expandedKpi === "trades";
  const isPipsExpanded = expandedKpi === "pips";
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

  const detailRows: Array<{
    label: string;
    value: string;
    tone: MetricTone;
    meta?: string;
    fullValue?: string;
  }> =
    expandedKpi === "gain"
      ? [
          {
            label: "Commission",
            value: formatCompactSignedNumber(normalizeNegativeAmount(profitDetail.data?.summary.totalCommission), 1),
            tone: toneFromNumber(normalizeNegativeAmount(profitDetail.data?.summary.totalCommission)),
            fullValue: formatSignedCurrency(normalizeNegativeAmount(profitDetail.data?.summary.totalCommission), 2),
          },
          {
            label: "Swap",
            value: formatCompactSignedNumber(profitDetail.data?.summary.totalSwap, 1),
            tone: toneFromNumber(profitDetail.data?.summary.totalSwap),
            fullValue: formatSignedCurrency(profitDetail.data?.summary.totalSwap, 2),
          },
          {
            label: "Deposits",
            value: formatCompactSignedNumber(profitDetail.data?.summary.totalDeposit, 1),
            tone: "positive",
            fullValue: formatSignedCurrency(profitDetail.data?.summary.totalDeposit, 2),
          },
          {
            label: "Withdrawals",
            value: formatCompactSignedNumber(normalizeNegativeAmount(profitDetail.data?.summary.totalWithdrawal), 1),
            tone: "warning",
            fullValue: formatSignedCurrency(normalizeNegativeAmount(profitDetail.data?.summary.totalWithdrawal), 2),
          },
        ]
      : expandedKpi === "dd"
        ? [
            {
              label: "ABS",
              value: formatCompactNumber(balanceDetail.data?.summary.absoluteDrawdown, 1),
              tone: drawdownTone(balanceDetail.data?.summary.absoluteDrawdown),
              meta: "Balance absolute drawdown",
              fullValue: formatCurrency(balanceDetail.data?.summary.absoluteDrawdown, 2),
            },
            {
              label: "MAX",
              value: formatCompactNumber(balanceDetail.data?.summary.maximalDrawdownAmount, 1),
              tone: drawdownTone(balanceDetail.data?.summary.maximalDrawdownAmount),
              meta: "Balance maximal drawdown",
              fullValue: formatCurrency(balanceDetail.data?.summary.maximalDrawdownAmount, 2),
            },
            {
              label: "WIN",
              value: formatPlainPercent(overview.data?.kpis.winPercent, 1),
              tone: toneFromNumber(overview.data?.kpis.winPercent),
              meta: "Closed positions win rate",
              fullValue: formatPlainPercent(overview.data?.kpis.winPercent, 1),
            },
          ]
        : expandedKpi === "trades"
            ? [
                {
                  label: "ACTIVITY",
                  value: formatPlainPercent(positionsDetail.data?.summary.tradeActivityPercent, 1),
                  tone: toneFromNumber(positionsDetail.data?.summary.tradeActivityPercent),
                  meta: "Activity%",
                },
                {
                  label: "TR/WK",
                  value: formatRatioValue(positionsDetail.data?.summary.tradesPerWeek, 1),
                  tone: toneFromNumber(positionsDetail.data?.summary.tradesPerWeek),
                  meta: "Trade per week",
                },
                {
                  label: "HOLD",
                  value: formatAverageHoldTime(positionsDetail.data?.summary.averageHoldHours),
                  tone: "neutral",
                  meta: "Average hold time",
                },
              ]
          : expandedKpi === "opens"
              ? [
                  {
                    label: "P/L",
                    value: formatCompactSignedNumber(positionsDetail.data?.summary.floatingProfit, 1),
                    tone: toneFromNumber(positionsDetail.data?.summary.floatingProfit),
                    fullValue: formatSignedCurrency(positionsDetail.data?.summary.floatingProfit, 2),
                  },
                  {
                    label: "Swap",
                    value: formatCompactSignedNumber(openPositionSwap, 1),
                    tone: toneFromNumber(openPositionSwap),
                    fullValue: formatSignedCurrency(openPositionSwap, 2),
                  },
                  {
                    label: "Margin",
                    value: formatCompactNumber(currentMargin, 1),
                    tone: Number.isFinite(currentMargin) && (currentMargin ?? 0) > 0 ? "warning" : "muted",
                    fullValue: formatCurrency(currentMargin, 2),
                  },
                  {
                    label: "Level",
                    value: formatPlainPercent(currentMarginLevel, 1),
                    tone: marginLevelTone(currentMarginLevel),
                    fullValue: formatPlainPercent(currentMarginLevel, 1),
                  },
                ]
            : [];
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

        {overview.error ? (
          <InlineState tone="error" title="Card unavailable" message={overview.error ?? "Failed to load dashboard card."} />
        ) : overview.loading && !overview.data ? (
          <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
        ) : (
          <div className={isOpensExpanded ? "sp-canvas is-opens-expanded" : isTradesExpanded ? "sp-canvas is-trades-expanded" : isPipsExpanded ? "sp-canvas is-pips-expanded" : "sp-canvas"}>
            {isOpensExpanded ? (
              positionsDetail.error ? (
                <InlineState tone="error" title="Open positions unavailable" message={positionsDetail.error} />
              ) : positionsDetail.loading && !positionsDetail.data ? (
                <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
              ) : (
                <OpenPositionsPanel positions={positionsDetail.data?.openPositions} />
              )
            ) : isTradesExpanded ? (
              positionsDetail.error ? (
                <InlineState tone="error" title="Trades unavailable" message={positionsDetail.error} />
              ) : positionsDetail.loading && !positionsDetail.data ? (
                <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
              ) : (
                <TradeHistoryPanel positions={positionsDetail.data?.historyPositions} />
              )
            ) : isPipsExpanded ? (
              pipsSummary.error ? (
                <InlineState tone="error" title="Pips unavailable" message={pipsSummary.error} />
              ) : pipsSummary.loading && !pipsSummary.data ? (
                <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
              ) : (
                <PipsPerformanceTable rows={pipsSummary.data?.rows ?? []} />
              )
            ) : (
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
            )}
          </div>
        )}

        {!isOpensExpanded && !isTradesExpanded && !isPipsExpanded ? (
          <div className="tf-row">
            <TimeframeStrip active={timeframe} onChange={handleTimeframeChange} />
          </div>
        ) : null}
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
              {Array.from({ length: expandedKpi === "pips" ? 3 : 4 }, (_, index) => (
                <div key={index} className="kpi-detail-item kpi-detail-item--skeleton" />
              ))}
            </div>
          ) : (
            <>
              <div className="kpi-detail-grid">
                {detailRows.map((row) => (
                  <SummaryChip
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    tone={row.tone}
                    meta={row.meta}
                    fullValue={row.fullValue}
                  />
                ))}
              </div>
            </>
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
  const [isLandscapeCarousel, setIsLandscapeCarousel] = useState(false);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [showPageIndicator, setShowPageIndicator] = useState(false);
  const [pendingRefreshRequests, setPendingRefreshRequests] = useState(0);
  const [hasSeenRefreshRequest, setHasSeenRefreshRequest] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const accountsSectionRef = useRef<HTMLElement | null>(null);
  const activeAccountIndexRef = useRef(0);
  const pullStartYRef = useRef<number | null>(null);
  const pullStartXRef = useRef<number | null>(null);
  const pullActiveRef = useRef(false);
  const activeRefreshKeyRef = useRef<number | null>(null);
  const refreshStartedAtRef = useRef(0);
  const refreshingRef = useRef(false);
  const resumeRefreshArmedRef = useRef(false);
  const indicatorHideTimerRef = useRef<number | null>(null);
  const lastLandscapeAccountOrderRef = useRef("");
  const wasLandscapeCarouselRef = useRef(false);

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
  const accountOrderKey = accounts.data?.map((account) => account.id).join("|") ?? "";

  const finishPull = useCallback(() => {
    pullStartYRef.current = null;
    pullStartXRef.current = null;
    pullActiveRef.current = false;
    setIsPulling(false);
  }, []);

  const revealPageIndicator = useCallback(() => {
    if (!isLandscapeCarousel || (accounts.data?.length ?? 0) < 2) {
      setShowPageIndicator(false);
      return;
    }

    setShowPageIndicator(true);
    if (indicatorHideTimerRef.current !== null) {
      window.clearTimeout(indicatorHideTimerRef.current);
    }
    indicatorHideTimerRef.current = window.setTimeout(() => {
      setShowPageIndicator(false);
      indicatorHideTimerRef.current = null;
    }, 1400);
  }, [accounts.data?.length, isLandscapeCarousel]);

  const syncActiveAccountIndex = useCallback((nextIndex: number) => {
    activeAccountIndexRef.current = nextIndex;
    setActiveAccountIndex((current) => (current === nextIndex ? current : nextIndex));
  }, []);

  const scrollToAccountIndex = useCallback((targetIndex: number, behavior: ScrollBehavior = "smooth") => {
    if (!isLandscapeCarousel) {
      return;
    }

    const section = accountsSectionRef.current;
    if (!section) {
      return;
    }

    const cards = Array.from(section.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    if (!cards.length) {
      return;
    }

    const clampedIndex = Math.max(0, Math.min(targetIndex, cards.length - 1));
    const targetCard = cards[clampedIndex];
    scrollElementToLeft(section, targetCard.offsetLeft, behavior);
    syncActiveAccountIndex(clampedIndex);
    revealPageIndicator();
  }, [isLandscapeCarousel, revealPageIndicator, syncActiveAccountIndex]);

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
    const mediaQuery = window.matchMedia("(orientation: landscape) and (max-width: 1180px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const nextMatches = event.matches;
      setIsLandscapeCarousel(nextMatches);

      if (!nextMatches) {
        setShowPageIndicator(false);
        syncActiveAccountIndex(0);
        lastLandscapeAccountOrderRef.current = "";
        wasLandscapeCarouselRef.current = false;
      }
    };

    handleChange(mediaQuery);

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [syncActiveAccountIndex]);

  useEffect(() => {
    return () => {
      if (indicatorHideTimerRef.current !== null) {
        window.clearTimeout(indicatorHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isLandscapeCarousel) {
      lastLandscapeAccountOrderRef.current = "";
      wasLandscapeCarouselRef.current = false;
      return;
    }

    if (!wasLandscapeCarouselRef.current) {
      const frameId = window.requestAnimationFrame(() => {
        scrollToAccountIndex(0, "auto");
      });
      wasLandscapeCarouselRef.current = true;
      return () => window.cancelAnimationFrame(frameId);
    }

    if ((accounts.data?.length ?? 0) > 1) {
      const frameId = window.requestAnimationFrame(() => {
        revealPageIndicator();
      });
      return () => window.cancelAnimationFrame(frameId);
    }
  }, [accounts.data?.length, isLandscapeCarousel, revealPageIndicator, scrollToAccountIndex]);

  useEffect(() => {
    const section = accountsSectionRef.current;
    if (!isLandscapeCarousel) {
      lastLandscapeAccountOrderRef.current = "";
      return;
    }

    if (!section || !accountOrderKey) {
      return;
    }

    const shouldResetToFirstAccount = lastLandscapeAccountOrderRef.current !== accountOrderKey;
    lastLandscapeAccountOrderRef.current = accountOrderKey;

    if (!shouldResetToFirstAccount) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToAccountIndex(0, "auto");
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [accountOrderKey, isLandscapeCarousel, scrollToAccountIndex]);

  useEffect(() => {
    const section = accountsSectionRef.current;
    if (!section || !isLandscapeCarousel) {
      return;
    }

    const resolveActiveIndex = () => {
      const cards = Array.from(section.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      if (!cards.length) {
        syncActiveAccountIndex(0);
        return;
      }

      const viewportCenter = section.scrollLeft + section.clientWidth / 2;
      let nextIndex = 0;
      let smallestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < smallestDistance) {
          smallestDistance = distance;
          nextIndex = index;
        }
      });

      if (nextIndex !== activeAccountIndexRef.current && accounts.data?.[nextIndex]) {
        trackAccountSwipe(displayName(accounts.data[nextIndex]), nextIndex);
      }
      syncActiveAccountIndex(nextIndex);
    };

    const handleScroll = () => {
      resolveActiveIndex();
      revealPageIndicator();
    };

    resolveActiveIndex();
    section.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      section.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [accounts.data, isLandscapeCarousel, revealPageIndicator, syncActiveAccountIndex]);

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
    if (refreshingRef.current || (scrollRef.current?.scrollTop ?? 0) > 0) {
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
    const scrollTop = scrollRef.current?.scrollTop ?? 0;

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

    if (delta <= 0 || scrollTop > 0) {
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
  const accountCount = accounts.data?.length ?? 0;
  const shouldRenderIndicators = isLandscapeCarousel && accountCount > 1;
  const visiblePageIndicator = shouldRenderIndicators && showPageIndicator;
  const canGoPreviousAccount = shouldRenderIndicators && activeAccountIndex > 0;
  const canGoNextAccount = shouldRenderIndicators && activeAccountIndex < accountCount - 1;

  return (
    <>
    <main className="monitor-page">
      <TradingMonitorSharedStyles />
      <div className="monitor-shell app-shell">
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
          className={
            isRefreshing
              ? `app-scroll dashboard-scroll is-refreshing${isLandscapeCarousel ? " is-carousel" : ""}`
              : `app-scroll dashboard-scroll${isLandscapeCarousel ? " is-carousel" : ""}`
          }
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={scrollStyle}
        >
          <section
            ref={accountsSectionRef}
            className={isLandscapeCarousel ? "dashboard-section dashboard-section--carousel" : "dashboard-section"}
            aria-label="Trading accounts"
          >
            {accounts.error ? (
              <AccountsUnavailableState
                message={accounts.error}
                onRetry={retryAccountsRequest}
                retrying={accounts.loading}
              />
            ) : accounts.loading && !accounts.data ? (
              <InlineState tone="info" title="Loading accounts" message="Fetching latest account data." />
            ) : accounts.data?.length ? (
              accounts.data.map((account, index) => (
                <LazyDashboardCard
                  key={account.id}
                  account={account}
                  index={index}
                  refreshKey={refreshKey}
                  onRequestStateChange={handleRequestStateChange}
                />
              ))
            ) : (
              <InlineState tone="empty" title="No account" message="No account data is available." />
            )}
          </section>
        </div>
        {shouldRenderIndicators ? (
          <div
            className={visiblePageIndicator ? "account-carousel-nav is-visible" : "account-carousel-nav"}
            aria-label="Account navigation"
          >
            <button
              type="button"
              className="account-carousel-nav__button account-carousel-nav__button--prev"
              onClick={() => scrollToAccountIndex(activeAccountIndex - 1)}
              disabled={!canGoPreviousAccount}
              aria-label="Previous account"
            >
              <span className="account-carousel-nav__glyph" aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="account-carousel-nav__button account-carousel-nav__button--next"
              onClick={() => scrollToAccountIndex(activeAccountIndex + 1)}
              disabled={!canGoNextAccount}
              aria-label="Next account"
            >
              <span className="account-carousel-nav__glyph" aria-hidden="true">›</span>
            </button>
          </div>
        ) : null}
        {shouldRenderIndicators ? (
          <div className={visiblePageIndicator ? "account-pages is-visible" : "account-pages"} aria-hidden="true">
            {Array.from({ length: accountCount }).map((_, index) => (
              <span
                key={index}
                className={index === activeAccountIndex ? "account-pages__dot is-active" : "account-pages__dot"}
              />
            ))}
          </div>
        ) : null}
      </div>
    </main>
    </>
  );
}
