"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import type {
  AccountOverviewResponse,
  EquityDetailResponse,
  PositionsResponse,
  ProfitDetailResponse,
  SerializedAccount,
  Timeframe,
  WinDetailResponse,
} from "@/lib/trading/types";

import {
  displayName,
  formatCompactNumber,
  formatCompactSignedCurrency,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSignedCurrency,
  formatWholeNumber,
  labelBalanceEvent,
  toneFromNumber,
} from "@/components/trading-monitor/formatters";
import { InlineState, MetricTile, SectionSkeleton, SparklineChart, TimeframeStrip } from "@/components/trading-monitor/shared";
import { useApiResource } from "@/components/trading-monitor/useApiResource";

type DashboardPanel = "profit" | "drawdown" | "win" | "trades" | "open-positions";

const TIMEFRAME_CONTEXT: Record<Timeframe, string> = {
  day: "Today",
  week: "This week",
  month: "MTD",
  year: "YTD",
  "all-time": "All time",
};

function formatCardGrowth(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = value ?? 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
    .format(Math.abs(numeric))
    .replace(/,/g, " ");

  return `${numeric > 0 ? "+" : numeric < 0 ? "-" : ""}${formatted}%`;
}

function formatPlainPercent(value: number | null | undefined, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${Math.abs(value ?? 0).toFixed(digits)}%`;
}

function formatDrawdownMetric(amount: number | null | undefined, percent: number | null | undefined) {
  const hasAmount = Number.isFinite(amount);
  const hasPercent = Number.isFinite(percent);

  if (hasAmount && hasPercent) {
    return `${formatCurrency(amount)} (${formatPlainPercent(percent)})`;
  }

  if (hasAmount) {
    return formatCurrency(amount);
  }

  if (hasPercent) {
    return formatPlainPercent(percent);
  }

  return "-";
}

function formatCompactSignedValue(value: number | null | undefined, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = value ?? 0;
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${sign}${formatCompactNumber(Math.abs(numeric), digits).toLowerCase()}`;
}

function formatPriceRange(openPrice: number | null | undefined, currentPrice: number | null | undefined) {
  const open = Number.isFinite(openPrice) ? formatNumber(openPrice, 5) : "-";
  const current = Number.isFinite(currentPrice) ? formatNumber(currentPrice, 5) : "-";
  return `${open} -> ${current}`;
}

function formatDealPrice(price: number | null | undefined) {
  return Number.isFinite(price) ? formatNumber(price, 5) : "-";
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

function DashboardPanelShell({
  panelId,
  eyebrow,
  title,
  summary,
  children,
}: {
  panelId: string;
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <section id={panelId} className="kdetail" aria-live="polite">
      <div className="kdetail__header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h4>{title}</h4>
        </div>
        <strong className="kdetail__summary">{summary}</strong>
      </div>
      {children}
    </section>
  );
}

function DashboardPanelSkeleton() {
  return (
    <div className="kdetail__loading" aria-hidden="true">
      <div className="skeleton-line skeleton-line--title" />
      <div className="skeleton-line skeleton-line--wide" />
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

function DashboardListSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="kdetail__section">
      <p className="kdetail__section-title">{title}</p>
      <div className="kdetail__list">{children}</div>
    </section>
  );
}

function KpiChipButton({
  label,
  value,
  tone = "neutral",
  active,
  panelId,
  onClick,
  fullWidth = false,
  meta,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "warning" | "neutral" | "muted";
  active: boolean;
  panelId: string;
  onClick: () => void;
  fullWidth?: boolean;
  meta?: string;
}) {
  return (
    <button
      type="button"
      className={active ? `kchip ${fullWidth ? "kchip--wide " : ""}is-active` : fullWidth ? "kchip kchip--wide" : "kchip"}
      aria-expanded={active}
      aria-controls={panelId}
      onClick={onClick}
    >
      <span className="kl">{label}</span>
      <strong className={`kv tone-${tone}`}>{value}</strong>
      {meta ? <span className="kchip__meta">{meta}</span> : null}
    </button>
  );
}

function ProfitPanel({
  panelId,
  periodLabel,
  detail,
  loading,
  error,
}: {
  panelId: string;
  periodLabel: string;
  detail: ProfitDetailResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <DashboardPanelShell
      panelId={panelId}
      eyebrow={periodLabel}
      title="Profit detail"
      summary={detail ? `${formatSignedCurrency(detail.summary.netProfit)}` : "Loading"}
    >
      {!detail && loading ? (
        <DashboardPanelSkeleton />
      ) : error && !detail ? (
        <InlineState tone="error" title="Profit detail unavailable" message={error} />
      ) : detail ? (
        detail ? (
          <>
            <div className="metric-cluster">
              <MetricTile label="Net Profit" value={formatSignedCurrency(detail.summary.netProfit)} tone={toneFromNumber(detail.summary.netProfit)} />
              <MetricTile label="Profit Factor" value={formatNumber(detail.summary.profitFactor, 2)} tone={toneFromNumber(detail.summary.profitFactor)} />
            </div>

            <DashboardListSection title="Daily Profit (last 5 days)">
              {detail.summary.dailyProfit.map((item) => (
                <div key={item.date} className="kdetail__row">
                  <div className="kdetail__row-main">
                    <strong>{item.date}</strong>
                  </div>
                  <div className="kdetail__row-trail">
                    <strong className={`tone-${toneFromNumber(item.profit)}`}>{formatSignedCurrency(item.profit)}</strong>
                  </div>
                </div>
              ))}
            </DashboardListSection>
          </>
        ) : (
          <InlineState tone="empty" title="No deal history" message="Profit detail will appear once the selected timeframe includes deal history." />
        )
      ) : (
        <InlineState tone="empty" title="No profit detail" message="No profit analytics are available for this card yet." />
      )}
    </DashboardPanelShell>
  );
}

function DrawdownPanel({
  panelId,
  periodLabel,
  detail,
  loading,
  error,
}: {
  panelId: string;
  periodLabel: string;
  detail: EquityDetailResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <DashboardPanelShell
      panelId={panelId}
      eyebrow={periodLabel}
      title="Risk & drawdown"
      summary={detail ? `${formatPlainPercent(detail.summary.maximalDrawdownPct)}` : "Loading"}
    >
      {!detail && loading ? (
        <DashboardPanelSkeleton />
      ) : error && !detail ? (
        <InlineState tone="error" title="Risk detail unavailable" message={error} />
      ) : detail ? (
        detail ? (
          <>
            <div className="metric-cluster">
              <MetricTile
                label="Absolute Drawdown"
                value={formatCurrency(detail.summary.absoluteDrawdown)}
                tone={toneFromNumber(
                  detail.summary.absoluteDrawdown === null ? null : -detail.summary.absoluteDrawdown,
                )}
              />
              <MetricTile
                label="Relative Drawdown"
                value={formatPlainPercent(detail.summary.relativeDrawdownPct)}
                tone={toneFromNumber(
                  detail.summary.relativeDrawdownPct === null ? null : -detail.summary.relativeDrawdownPct,
                )}
              />
              <MetricTile
                label="Maximal Drawdown"
                value={formatDrawdownMetric(detail.summary.maximalDrawdownAmount, detail.summary.maximalDrawdownPct)}
                tone={toneFromNumber(
                  detail.summary.maximalDrawdownPct === null ? null : -detail.summary.maximalDrawdownPct,
                )}
              />
              <MetricTile
                label="Maximal Deposit Load"
                value={formatPlainPercent(detail.summary.maximalDepositLoad)}
                tone={toneFromNumber(
                  detail.summary.maximalDepositLoad === null ? null : -detail.summary.maximalDepositLoad,
                )}
              />
            </div>

            <div className="kdetail__chart">
              <SparklineChart points={detail.drawdownCurve} active={false} tone="negative" />
            </div>

            <DashboardListSection title="Latest balance events">
              {[...detail.equityCurve].slice(-4).reverse().map((point) => (
                <div key={`${point.x}-${point.balance}`} className="kdetail__row">
                  <div className="kdetail__row-main">
                    <strong>{labelBalanceEvent(point.eventType, point.eventDelta)}</strong>
                    <span>{formatDateTime(point.x)}</span>
                  </div>
                  <div className="kdetail__row-trail">
                    <strong className={`tone-${toneFromNumber(point.eventDelta)}`}>{formatSignedCurrency(point.eventDelta)}</strong>
                    <span>Eq. {formatCurrency(point.equity)}</span>
                  </div>
                </div>
              ))}
            </DashboardListSection>
          </>
        ) : (
          <InlineState tone="empty" title="No drawdown curve" message="Risk detail will appear once the selected timeframe has balance events." />
        )
      ) : (
        <InlineState tone="empty" title="No drawdown detail" message="No drawdown analytics are available for this card yet." />
      )}
    </DashboardPanelShell>
  );
}

function WinPanel({
  panelId,
  periodLabel,
  detail,
  loading,
  error,
}: {
  panelId: string;
  periodLabel: string;
  detail: WinDetailResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <DashboardPanelShell
      panelId={panelId}
      eyebrow={periodLabel}
      title="Win statistics"
      summary={detail ? `${formatPlainPercent(detail.summary.winRate)} win rate` : "Loading"}
    >
      {!detail && loading ? (
        <DashboardPanelSkeleton />
      ) : error && !detail ? (
        <InlineState tone="error" title="Win detail unavailable" message={error} />
      ) : detail ? (
        detail ? (
          <>
            <div className="metric-cluster">
              <MetricTile label="Win Rate" value={formatPlainPercent(detail.summary.winRate)} tone={toneFromRate(detail.summary.winRate)} />
              <MetricTile label="Wins" value={formatWholeNumber(detail.summary.wins)} tone="positive" />
              <MetricTile label="Losses" value={formatWholeNumber(detail.summary.losses)} tone="negative" />
              <MetricTile label="Sharpe Ratio" value={formatNumber(detail.summary.sharpeRatio, 2)} tone={toneFromNumber(detail.summary.sharpeRatio)} />
              <MetricTile label="Profit Factor" value={formatNumber(detail.summary.profitFactor, 2)} tone={toneFromNumber(detail.summary.profitFactor)} />
              <MetricTile label="Recovery Factor" value={formatNumber(detail.summary.recoveryFactor, 2)} tone={toneFromNumber(detail.summary.recoveryFactor)} />
              <MetricTile label="Expect Payoff" value={formatSignedCurrency(detail.summary.expectedPayoff)} tone={toneFromNumber(detail.summary.expectedPayoff)} />
              <MetricTile label="Avg Consecutive Wins" value={formatWholeNumber(detail.summary.averageConsecutiveWins)} />
              <MetricTile label="Avg Consecutive Losses" value={formatWholeNumber(detail.summary.averageConsecutiveLosses)} />
            </div>
          </>
        ) : (
          <InlineState tone="empty" title="No win data" message="Win statistics will appear once the selected timeframe includes closed trades." />
        )
      ) : (
        <InlineState tone="empty" title="No win statistics" message="No win analytics are available for this card yet." />
      )}
    </DashboardPanelShell>
  );
}

function TradesPanel({
  panelId,
  periodLabel,
  timeframe,
  detail,
  loading,
  error,
}: {
  panelId: string;
  periodLabel: string;
  timeframe: Timeframe;
  detail: PositionsResponse | null;
  loading: boolean;
  error: string | null;
}) {

  return (
    <DashboardPanelShell
      panelId={panelId}
      eyebrow={periodLabel}
      title="Trades"
      summary={detail ? `${formatWholeNumber(detail.summary.dealCount)} deals` : "Loading"}
    >
      {!detail && loading ? (
        <DashboardPanelSkeleton />
      ) : error && !detail ? (
        <InlineState tone="error" title="Trades unavailable" message={error} />
      ) : detail ? (
        detail ? (
          <>
            <div className="metric-cluster">
              <MetricTile label="Deals" value={formatWholeNumber(detail.summary.dealCount)} tone="warning" />
              <MetricTile label="Trades/Week" value={formatNumber(detail.summary.tradesPerWeek, 1)} tone={toneFromNumber(detail.summary.tradesPerWeek)} />
              <MetricTile label="Long Trade Win" value={formatPlainPercent(detail.summary.longTradeWin)} tone={toneFromRate(detail.summary.longTradeWin)} />
              <MetricTile label="Short Trade Win" value={formatPlainPercent(detail.summary.shortTradeWin)} tone={toneFromRate(detail.summary.shortTradeWin)} />
            </div>

            <DashboardListSection title="Recent deals">
              {detail.recentDeals.slice(0, 4).map((trade) => {
                const side = trade.side?.toLowerCase() === "sell" ? "sell" : "buy";
                return (
                  <div key={`${trade.dealId}-${trade.time}`} className="kdetail__row">
                    <div className="kdetail__row-main">
                      <span className={`overlay-side is-${side}`}>{trade.side}</span>
                      <div>
                        <strong>{trade.symbol}</strong>
                        <span>{formatDateTime(trade.time)}</span>
                      </div>
                    </div>
                    <div className="kdetail__row-trail">
                      <strong className={`tone-${toneFromNumber(trade.pnl)}`}>{formatSignedCurrency(trade.pnl)}</strong>
                      <span>{formatNumber(trade.volume, 2)} lot · {formatDealPrice(trade.price)}</span>
                    </div>
                  </div>
                );
              })}
            </DashboardListSection>

            <DashboardListSection title="Symbol Trade %">
              {detail.summary.symbolTradePercent.slice(0, 4).map((item) => (
                <div key={item.symbol} className="kdetail__row">
                  <div className="kdetail__row-main">
                    <strong>{item.symbol}</strong>
                  </div>
                  <div className="kdetail__row-trail">
                    <strong>{formatPlainPercent(item.percent)}</strong>
                  </div>
                </div>
              ))}
            </DashboardListSection>
          </>
        ) : (
          <InlineState tone="empty" title="No trades" message="The latest report has no deals, open positions, or working orders to summarize here." />
        )
      ) : (
        <InlineState tone="empty" title="No trade detail" message="No trade summary is available for this card yet." />
      )}
    </DashboardPanelShell>
  );
}

function OpenPositionsPanel({
  panelId,
  detail,
  loading,
  error,
}: {
  panelId: string;
  detail: PositionsResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <DashboardPanelShell
      panelId={panelId}
      eyebrow="Live snapshot"
      title="Open positions"
      summary={detail ? `${formatSignedCurrency(detail.summary.floatingProfit)} float` : "Loading"}
    >
      {!detail && loading ? (
        <DashboardPanelSkeleton />
      ) : error && !detail ? (
        <InlineState tone="error" title="Open positions unavailable" message={error} />
      ) : detail ? (
        detail.openPositions.length ? (
          <DashboardListSection title={`${formatWholeNumber(detail.summary.openCount)} live positions`}>
            {detail.openPositions.map((position) => {
              const side = position.side?.toLowerCase() === "sell" ? "sell" : "buy";
              return (
                <div key={position.positionId} className="kdetail__row kdetail__row--position">
                  <div className="kdetail__row-main">
                    <strong>{position.symbol}</strong>
                    <span className={`overlay-side is-${side}`}>{position.side}</span>
                    <span>{formatNumber(position.volume, 2)} lot</span>
                  </div>
                  <div className="kdetail__row-trail">
                    <strong className={`tone-${toneFromNumber(position.floatingProfit)}`}>{formatSignedCurrency(position.floatingProfit)}</strong>
                    <span>{formatPriceRange(position.openPrice, position.marketPrice)}</span>
                  </div>
                </div>
              );
            })}
          </DashboardListSection>
        ) : (
          <InlineState tone="empty" title="No open positions" message="There are no live positions in the latest imported snapshot." />
        )
      ) : (
        <InlineState tone="empty" title="No open positions" message="No open-position snapshot is available for this card yet." />
      )}
    </DashboardPanelShell>
  );
}

function DashboardCard({ account }: { account: SerializedAccount }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("all-time");
  const [activePanel, setActivePanel] = useState<DashboardPanel | null>(null);
  const overview = useApiResource<AccountOverviewResponse>(`/api/accounts/${account.id}?timeframe=${timeframe}`);
  const detailTimeframe = TIMEFRAME_CONTEXT[timeframe];
  const resolvedAccount = overview.data?.account;
  const accountSource = resolvedAccount ?? account;
  const active = accountSource.status === "Active";
  const sparklinePoints = overview.data?.equityCurve.length
    ? overview.data.equityCurve
    : [{ x: "0", y: 0 }];
  const accountName = displayName(accountSource);
  const accountNumber = accountSource.account_number;
  const growthTone = toneFromNumber(overview.data?.kpis.netProfit);
  const sparklineTone = growthTone === "muted" ? "neutral" : growthTone;
  const winTone = toneFromRate(overview.data?.kpis.winPercent);
  const openTone = toneFromNumber(overview.data?.kpis.floatingPL ?? accountSource.floating_pl);
  const positionsUrl =
    activePanel === "trades" || activePanel === "open-positions"
      ? `/api/accounts/${account.id}/positions?timeframe=${timeframe}`
      : null;
  const profitUrl = activePanel === "profit" ? `/api/accounts/${account.id}/profit-detail?timeframe=${timeframe}` : null;
  const drawdownUrl = activePanel === "drawdown" ? `/api/accounts/${account.id}/equity-detail?timeframe=${timeframe}` : null;
  const winUrl = activePanel === "win" ? `/api/accounts/${account.id}/win-detail?timeframe=${timeframe}` : null;
  const positions = useApiResource<PositionsResponse>(positionsUrl);
  const profit = useApiResource<ProfitDetailResponse>(profitUrl);
  const drawdown = useApiResource<EquityDetailResponse>(drawdownUrl);
  const win = useApiResource<WinDetailResponse>(winUrl);

  const panelId = (panel: DashboardPanel) => `dashboard-panel-${account.id}-${panel}`;
  const togglePanel = (panel: DashboardPanel) => setActivePanel((current) => (current === panel ? null : panel));

  return (
    <article className="card account-card">
      <div className="acc-header">
        <div>
          <div className="acc-name">
            <h3 className="acc-name-text">
              <Link href={`/accounts/${account.id}`}>{accountName}</Link>
            </h3>
          </div>
          <p className="acc-sub">#{accountNumber}</p>
          <Link className="acc-balance" href={`/accounts/${account.id}`}>
            {formatCurrency(accountSource.balance)}
          </Link>
        </div>
        <Link className={active ? "status-badge is-live" : "status-badge"} href={`/accounts/${account.id}`}>
          <span className="status-badge__dot" aria-hidden="true" />
          {active ? "Algo on" : "Algo off"}
        </Link>
      </div>

      <div className="sp-wrap">
        <div className="sp-top sp-top--compact">
          <Link className={`sp-growth tone-${growthTone}`} href={`/accounts/${account.id}#results`}>
            <strong>{formatCompactSignedValue(overview.data?.kpis.netProfit)}</strong>
          </Link>
        </div>

        {overview.error ? (
          <InlineState tone="error" title="Card unavailable" message={overview.error ?? "Failed to load dashboard card."} />
        ) : overview.loading && !overview.data ? (
          <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
        ) : overview.data ? (
          <Link className="sp-canvas" href={`/accounts/${account.id}#results`}>
            <SparklineChart points={sparklinePoints} active={active} tone={sparklineTone} />
          </Link>
        ) : (
          <Link className="sp-canvas" href={`/accounts/${account.id}#results`}>
            <SparklineChart points={sparklinePoints} active={active} tone={sparklineTone} />
          </Link>
        )}

        <div className="tf-row">
          <TimeframeStrip active={timeframe} onChange={setTimeframe} />
        </div>
      </div>

      <div className="kgrid">
        <KpiChipButton
          label="Profit"
          value={formatCompactSignedValue(overview.data?.kpis.netProfit)}
          tone={toneFromNumber(overview.data?.kpis.netProfit)}
          active={activePanel === "profit"}
          panelId={panelId("profit")}
          onClick={() => togglePanel("profit")}
        />
        <KpiChipButton
          label="DD"
          value={formatPlainPercent(overview.data?.kpis.drawdown)}
          tone={toneFromNumber(-(overview.data?.kpis.drawdown ?? 0))}
          active={activePanel === "drawdown"}
          panelId={panelId("drawdown")}
          onClick={() => togglePanel("drawdown")}
        />
        <KpiChipButton
          label="Win"
          value={formatPlainPercent(overview.data?.kpis.winPercent)}
          tone={winTone}
          active={activePanel === "win"}
          panelId={panelId("win")}
          onClick={() => togglePanel("win")}
        />
        <KpiChipButton
          label="Trades"
          value={formatWholeNumber(overview.data?.kpis.trades)}
          tone="warning"
          active={activePanel === "trades"}
          panelId={panelId("trades")}
          onClick={() => togglePanel("trades")}
        />
        <Link className="kchip kchip--link" href={`/accounts/${account.id}#results`}>
          <span className="kl">Open</span>
          <strong className={`kv tone-${openTone}`}>{formatCompactSignedCurrency(overview.data?.kpis.floatingPL ?? accountSource.floating_pl)}</strong>
        </Link>
        <KpiChipButton
          label="Open positions"
          value={formatWholeNumber(overview.data?.kpis.openCount)}
          tone={toneFromNumber(overview.data?.kpis.openCount)}
          active={activePanel === "open-positions"}
          panelId={panelId("open-positions")}
          onClick={() => togglePanel("open-positions")}
          fullWidth
          meta="Live snapshot"
        />
      </div>

      {activePanel === "profit" ? (
        <ProfitPanel
          panelId={panelId("profit")}
          periodLabel={detailTimeframe}
          detail={profit.data}
          loading={profit.loading}
          error={profit.error}
        />
      ) : null}

      {activePanel === "drawdown" ? (
        <DrawdownPanel
          panelId={panelId("drawdown")}
          periodLabel={detailTimeframe}
          detail={drawdown.data}
          loading={drawdown.loading}
          error={drawdown.error}
        />
      ) : null}

      {activePanel === "win" ? (
        <WinPanel
          panelId={panelId("win")}
          periodLabel={detailTimeframe}
          detail={win.data}
          loading={win.loading}
          error={win.error}
        />
      ) : null}

      {activePanel === "trades" ? (
        <TradesPanel
          panelId={panelId("trades")}
          periodLabel={detailTimeframe}
          timeframe={timeframe}
          detail={positions.data}
          loading={positions.loading}
          error={positions.error}
        />
      ) : null}

      {activePanel === "open-positions" ? (
        <OpenPositionsPanel
          panelId={panelId("open-positions")}
          detail={positions.data}
          loading={positions.loading}
          error={positions.error}
        />
      ) : null}
    </article>
  );
}

export default function DashboardClient() {
  const accounts = useApiResource<SerializedAccount[]>("/api/accounts");

  return (
    <main className="monitor-page">
      <div className="monitor-shell app-shell">
        <div className="app-scroll dashboard-scroll">
          <section className="dashboard-section" aria-label="Trading accounts">
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
              accounts.data.map((account) => <DashboardCard key={account.id} account={account} />)
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
      </div>
    </main>
  );
}
