"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent as ReactTouchEvent } from "react";

import type {
  AccountOverviewResponse,
  SerializedAccount,
  Timeframe,
} from "@/lib/trading/types";

import {
  displayName,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  toneFromNumber,
} from "@/components/trading-monitor/formatters";
import {
  InlineState,
  SectionSkeleton,
  SparklineChart,
  TimeframeStrip,
  TradingMonitorSharedStyles,
} from "@/components/trading-monitor/shared";
import { useApiResource } from "@/components/trading-monitor/useApiResource";

const PULL_THRESHOLD = 72;
const MAX_PULL_DISTANCE = 116;
const REFRESH_HOLD_DISTANCE = 52;
const MIN_REFRESH_VISIBLE_MS = 520;
const SPINNER_CIRCUMFERENCE = 62.83;

function trimTrailingZeroDecimals(value: string) {
  return value
    .replace(/(\.\d*?[1-9])0+(?=[a-z%]|$)/gi, "$1")
    .replace(/\.0+(?=[a-z%]|$)/gi, "");
}

function formatPlainPercent(value: number | null | undefined, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${trimTrailingZeroDecimals(Math.abs(value ?? 0).toFixed(digits))}%`;
}

function formatSignedCompactKpiValue(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = value ?? 0;
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  const absolute = Math.abs(numeric);

  if (absolute < 1000) {
    return `${sign}${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(absolute)}`;
  }

  const withTwoDigits = `${sign}${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(absolute).toLowerCase()}`;

  if (withTwoDigits.length <= 6) {
    return trimTrailingZeroDecimals(withTwoDigits);
  }

  return trimTrailingZeroDecimals(`${sign}${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(absolute).toLowerCase()}`);
}

function formatCompactCountKpi(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = Math.max(0, Math.round(value ?? 0));
  if (numeric < 1000) {
    return `${numeric}`;
  }

  return trimTrailingZeroDecimals(new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric).toLowerCase());
}

function toneFromRate(value: number | null | undefined, benchmark = 50) {
  if (!Number.isFinite(value)) {
    return "muted";
  }

  if ((value ?? 0) > benchmark) {
    return "positive";
  }

  if ((value ?? 0) < benchmark) {
    return "negative";
  }

  return "neutral";
}

function SummaryChip({
  label,
  value,
  tone = "neutral",
  meta,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "warning" | "neutral" | "muted";
  meta?: string;
}) {
  return (
    <div className="kchip">
      <>
        <span className="kl">{label}</span>
        <strong className={`kv tone-${tone}`}>{value}</strong>
        {meta ? <span className="kchip__meta">{meta}</span> : null}
      </>
    </div>
  );
}

function applyPullResistance(distance: number) {
  const dampenedDistance = distance * 0.5;

  if (dampenedDistance <= PULL_THRESHOLD) {
    return dampenedDistance;
  }

  return Math.min(MAX_PULL_DISTANCE, PULL_THRESHOLD + (dampenedDistance - PULL_THRESHOLD) * 0.35);
}

function DashboardCard({
  account,
  refreshKey,
  onRequestStateChange,
}: {
  account: SerializedAccount;
  refreshKey: number;
  onRequestStateChange: (request: { loading: boolean; refreshKey: number }) => void;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [highlightedBalance, setHighlightedBalance] = useState<number | null>(null);
  const overview = useApiResource<AccountOverviewResponse>(`/api/accounts/${account.id}?timeframe=${timeframe}`, {
    refreshKey,
    onRequestStateChange,
  });
  const accountSource = overview.data?.account ?? account;
  const active = accountSource.status === "Active";
  const sparklinePoints = overview.data?.balanceCurve.length
    ? overview.data.balanceCurve
    : [{ x: "0", y: 0 }];
  const growthTone = toneFromNumber(overview.data?.kpis.periodGrowth);
  const gainTone = toneFromNumber(overview.data?.kpis.netProfit);
  const drawdownTone = toneFromNumber(-(overview.data?.kpis.drawdown ?? 0));
  const winTone = toneFromRate(overview.data?.kpis.winPercent);
  const openTone = (overview.data?.kpis.openCount ?? 0) > 0 ? "warning" : "muted";
  const accountLabel = accountSource.account_number ? `#${accountSource.account_number}` : "Unnumbered";
  const firstName = displayName(accountSource);
  const displayedBalance = highlightedBalance ?? accountSource.balance;
  const displayedGrowth = formatPercent(overview.data?.kpis.periodGrowth, 1);
  const displayedBalanceLabel = formatCurrency(displayedBalance, 2);

  useEffect(() => {
    setHighlightedBalance(null);
  }, [timeframe, refreshKey, overview.data?.account.balance]);

  return (
    <article className={`card account-card ${active ? "account-card--active" : "account-card--inactive"}`}>
      <div className="sp-wrap">
        <div className="sp-header">
          <div className="sp-top sp-top--compact">
            <div className="sp-identity sp-identity--header">
              <div className="sp-name">{firstName}</div>
              <div className="sp-account">{accountLabel}</div>
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
          <div className="sp-canvas">
            <SparklineChart
              points={sparklinePoints}
              active={active}
              tone="neutral"
              onHighlightBalanceChange={setHighlightedBalance}
              timeframe={timeframe}
              liveTimestamp={accountSource.last_updated}
              liveBalance={accountSource.balance}
            />
          </div>
        )}

        <div className="tf-row">
          <TimeframeStrip active={timeframe} onChange={setTimeframe} />
        </div>
      </div>

      <div className="kgrid">
        <SummaryChip
          label="Gain"
          value={formatSignedCompactKpiValue(overview.data?.kpis.netProfit)}
          tone={gainTone}
        />
        <SummaryChip
          label="DD"
          value={formatPlainPercent(overview.data?.kpis.drawdown, 1)}
          tone={drawdownTone}
        />
        <SummaryChip
          label="Win"
          value={formatPlainPercent(overview.data?.kpis.winPercent, 1)}
          tone={winTone}
        />
        <SummaryChip
          label="Trades"
          value={formatCompactCountKpi(overview.data?.kpis.trades)}
          tone="warning"
        />
        <SummaryChip
          label="Opens"
          value={formatCompactCountKpi(overview.data?.kpis.openCount)}
          tone={openTone}
        />
      </div>
    </article>
  );
}

export default function DashboardClient() {
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
  const pullStartYRef = useRef<number | null>(null);
  const pullStartXRef = useRef<number | null>(null);
  const pullActiveRef = useRef(false);
  const activeRefreshKeyRef = useRef<number | null>(null);
  const refreshStartedAtRef = useRef(0);
  const refreshingRef = useRef(false);
  const indicatorHideTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    const mediaQuery = window.matchMedia("(orientation: landscape) and (max-width: 1180px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsLandscapeCarousel(event.matches);
    };

    handleChange(mediaQuery);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    return () => {
      if (indicatorHideTimerRef.current !== null) {
        window.clearTimeout(indicatorHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isLandscapeCarousel) {
      setShowPageIndicator(false);
      setActiveAccountIndex(0);
      return;
    }

    if ((accounts.data?.length ?? 0) > 1) {
      revealPageIndicator();
    }
  }, [accounts.data?.length, isLandscapeCarousel, revealPageIndicator]);

  useEffect(() => {
    const section = accountsSectionRef.current;
    if (!section || !isLandscapeCarousel) {
      return;
    }

    const resolveActiveIndex = () => {
      const cards = Array.from(section.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      if (!cards.length) {
        setActiveAccountIndex(0);
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

      setActiveAccountIndex(nextIndex);
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
  }, [isLandscapeCarousel, revealPageIndicator]);

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

  return (
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
              <div className="card">
                <InlineState tone="error" title="Accounts unavailable" message={accounts.error} />
              </div>
            ) : accounts.loading && !accounts.data ? (
              <>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="card">
                    <SectionSkeleton />
                  </div>
                ))}
              </>
            ) : accounts.data?.length ? (
              accounts.data.map((account) => (
                <DashboardCard
                  key={account.id}
                  account={account}
                  refreshKey={refreshKey}
                  onRequestStateChange={handleRequestStateChange}
                />
              ))
            ) : (
              <div className="card">
                <InlineState
                  tone="empty"
                  title="No accounts"
                  message="Account cards will appear here after the backend imports report data."
                />
              </div>
            )}
          </section>
        </div>
        {shouldRenderIndicators ? (
          <div className={showPageIndicator ? "account-pages is-visible" : "account-pages"} aria-hidden="true">
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
  );
}
