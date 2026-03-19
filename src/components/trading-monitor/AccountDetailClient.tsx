"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ReportDetailResponse } from "@/lib/trading/types";

import {
  displayName,
  displayValue,
  formatCompactCurrency,
  formatCompactNumber,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  formatWholeNumber,
  toneFromNumber,
} from "@/components/trading-monitor/formatters";
import {
  InlineState,
  MetricTile,
  SectionHeading,
  SectionSkeleton,
  SummaryChip,
} from "@/components/trading-monitor/shared";
import { useApiResource } from "@/components/trading-monitor/useApiResource";

function ResultsSection({
  detail,
  loading,
  error,
}: {
  detail: ReportDetailResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section id="results" className="card detail-card">
      <SectionHeading
        eyebrow="Results"
        title="Report results"
        description="Core account results stay anchored to the latest imported report."
      />

      {!detail && loading ? (
        <SectionSkeleton />
      ) : error && !detail ? (
        <InlineState tone="error" title="Results unavailable" message={error} />
      ) : detail ? (
        <div className="metric-cluster">
          <MetricTile label="Balance" value={formatCompactCurrency(detail.summary.balance)} />
          <MetricTile label="Equity" value={formatCompactCurrency(detail.summary.equity)} />
          <MetricTile label="Net" value={formatCompactCurrency(detail.summary.netProfit)} tone={toneFromNumber(detail.summary.netProfit)} />
          <MetricTile label="Gross Profit" value={formatCompactCurrency(detail.summary.grossProfit)} />
          <MetricTile label="Gross Loss" value={formatCompactCurrency(detail.summary.grossLoss)} />
          <MetricTile label="Results" value={formatCompactNumber(detail.summary.resultCount, 1)} />
          <MetricTile label="Volume" value={formatNumber(detail.summary.resultVolume, 2)} />
          <MetricTile label="Win Rate" value={formatPercent(detail.summary.winRate, 1)} tone={toneFromNumber(detail.summary.winRate)} />
        </div>
      ) : (
        <InlineState tone="empty" title="No results" message="There is no imported report detail for this account yet." />
      )}
    </section>
  );
}

function TradeStatsSection({
  detail,
  loading,
  error,
}: {
  detail: ReportDetailResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section id="trade-stats" className="card detail-card">
      <SectionHeading
        eyebrow="Trade Stats"
        title="Trade statistics"
        description="Win, loss, streak, and expectancy figures from the latest imported report."
      />

      {!detail && loading ? (
        <SectionSkeleton />
      ) : error && !detail ? (
        <InlineState tone="error" title="Trade stats unavailable" message={error} />
      ) : detail ? (
        <>
          <div className="metric-cluster">
            <MetricTile label="Trades" value={formatCompactNumber(detail.tradeStats.totalTrades, 1)} />
            <MetricTile label="Wins" value={formatCompactNumber(detail.tradeStats.wins, 1)} tone="positive" />
            <MetricTile label="Losses" value={formatCompactNumber(detail.tradeStats.losses, 1)} tone="negative" />
            <MetricTile label="Expectancy" value={formatCompactCurrency(detail.tradeStats.expectancy)} tone={toneFromNumber(detail.tradeStats.expectancy)} />
            <MetricTile label="Avg Trade" value={formatCompactCurrency(detail.tradeStats.avgTradeNet)} tone={toneFromNumber(detail.tradeStats.avgTradeNet)} />
            <MetricTile label="Best Trade" value={formatCompactCurrency(detail.tradeStats.bestTrade)} tone={toneFromNumber(detail.tradeStats.bestTrade)} />
            <MetricTile label="Worst Trade" value={formatCompactCurrency(detail.tradeStats.worstTrade)} tone={toneFromNumber(detail.tradeStats.worstTrade)} />
            <MetricTile label="Profit Factor" value={formatNumber(detail.tradeStats.profitFactor, 2)} tone={toneFromNumber(detail.tradeStats.profitFactor)} />
          </div>

          <div className="list-card">
            <div className="detail-grid">
              <span>Total Trades: {formatWholeNumber(detail.tradeStats.totalTrades)}</span>
              <span>Wins: {formatWholeNumber(detail.tradeStats.wins)}</span>
              <span>Losses: {formatWholeNumber(detail.tradeStats.losses)}</span>
              <span>Breakeven: {formatWholeNumber(detail.tradeStats.breakeven)}</span>
              <span>Win Rate: {formatPercent(detail.tradeStats.winRate, 1)}</span>
              <span>Loss Rate: {formatPercent(detail.tradeStats.lossRate, 1)}</span>
              <span>Total Volume: {formatNumber(detail.tradeStats.totalVolume, 2)}</span>
              <span>Average Volume: {formatNumber(detail.tradeStats.averageVolume, 2)}</span>
              <span>Avg Trade: {formatSignedCurrency(detail.tradeStats.avgTradeNet)}</span>
              <span>Avg Win: {formatCurrency(detail.tradeStats.avgWin)}</span>
              <span>Avg Loss: {formatCurrency(detail.tradeStats.avgLoss)}</span>
              <span>Expectancy: {formatSignedCurrency(detail.tradeStats.expectancy)}</span>
              <span>Best Trade: {formatSignedCurrency(detail.tradeStats.bestTrade)}</span>
              <span>Worst Trade: {formatSignedCurrency(detail.tradeStats.worstTrade)}</span>
              <span>Commission: {formatSignedCurrency(detail.summary.commissionTotal)}</span>
              <span>Swap: {formatSignedCurrency(detail.summary.swapTotal)}</span>
              <span>Best Win Streak: {formatWholeNumber(detail.tradeStats.bestWinStreak)}</span>
              <span>Worst Loss Streak: {formatWholeNumber(detail.tradeStats.worstLossStreak)}</span>
              <span>Buy Trades: {formatWholeNumber(detail.tradeStats.longTrades)}</span>
              <span>Sell Trades: {formatWholeNumber(detail.tradeStats.shortTrades)}</span>
              <span>Buy Win Rate: {formatPercent(detail.tradeStats.longWinRate, 1)}</span>
              <span>Sell Win Rate: {formatPercent(detail.tradeStats.shortWinRate, 1)}</span>
            </div>
          </div>
        </>
      ) : (
        <InlineState tone="empty" title="No trade stats" message="There is no imported report detail for this account yet." />
      )}
    </section>
  );
}

function TradingHistorySection({
  detail,
  expandedResultId,
  onToggle,
  loading,
  error,
}: {
  detail: ReportDetailResponse | null;
  expandedResultId: string | null;
  onToggle: (dealId: string) => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section id="trading-history" className="card detail-card">
      <SectionHeading
        eyebrow="Trading History"
        title="Deal history"
        description="Ledger deal rows from the latest imported report."
      />

      {!detail && loading ? (
        <SectionSkeleton />
      ) : error && !detail ? (
        <InlineState tone="error" title="Trading history unavailable" message={error} />
      ) : detail ? (
        detail.results.length ? (
          <div className="history-list">
            {detail.results.map((trade) => {
              const expanded = expandedResultId === trade.dealId;
              const side = trade.side?.toLowerCase() === "sell" ? "sell" : "buy";

              return (
                <article key={`${trade.dealId}-${trade.time}`} className={expanded ? "history-row is-expanded" : "history-row"}>
                  <button
                    type="button"
                    className="history-row__summary"
                    onClick={() => onToggle(trade.dealId)}
                    aria-expanded={expanded}
                  >
                    <div className="history-row__lead">
                      <span className={`overlay-side is-${side}`}>{displayValue(trade.side)}</span>
                      <div>
                        <strong>{displayValue(trade.symbol)}</strong>
                        <span>{formatDateTime(trade.time)}</span>
                      </div>
                    </div>
                    <div className="history-row__trail">
                      <span>{formatNumber(trade.volume, 2)} lot</span>
                      <strong className={`tone-${toneFromNumber(trade.net)}`}>{formatSignedCurrency(trade.net)}</strong>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="history-row__details">
                      <div className="detail-grid">
                        <span>Deal: {displayValue(trade.dealId)}</span>
                        <span>Time: {formatDateTime(trade.time)}</span>
                        <span>Price: {displayValue(trade.price)}</span>
                        <span>Volume: {displayValue(trade.volume)}</span>
                        <span className={`tone-${toneFromNumber(trade.profit)}`}>Profit: {formatSignedCurrency(trade.profit)}</span>
                        <span className={`tone-${toneFromNumber(trade.swap)}`}>Swap: {formatSignedCurrency(trade.swap)}</span>
                        <span className={`tone-${toneFromNumber(trade.commission)}`}>Commission: {formatSignedCurrency(trade.commission)}</span>
                        <span>Comment: {displayValue(trade.comment)}</span>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <InlineState tone="empty" title="No trading history" message="Deal rows will appear here after the imported report includes them." />
        )
      ) : (
        <InlineState tone="empty" title="No trading history" message="There is no imported report detail for this account yet." />
      )}
    </section>
  );
}

export default function AccountDetailClient({ accountId }: { accountId: string }) {
  const reportDetail = useApiResource<ReportDetailResponse>(`/api/accounts/${accountId}/report-detail`);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);

  useEffect(() => {
    const rows = reportDetail.data?.results ?? [];
    setExpandedResultId((current) => {
      if (!rows.length) {
        return null;
      }

      if (!current) {
        return rows[0].dealId;
      }

      return rows.some((row) => row.dealId === current) ? current : rows[0].dealId;
    });
  }, [reportDetail.data?.results]);

  if (!reportDetail.loading && reportDetail.error === "Account not found" && !reportDetail.data) {
    return (
      <main className="monitor-page">
        <div className="monitor-shell app-shell">
          <div className="app-scroll detail-scroll">
            <div className="card detail-card">
              <InlineState
                tone="empty"
                title="Account not found"
                message="The requested account could not be loaded from the current report datasource."
              />
            </div>
          </div>
        </div>
      </main>
    );
  }

  const detail = reportDetail.data;
  const account = detail?.account ?? null;

  return (
    <main className="monitor-page">
      <div className="monitor-shell app-shell">
        <div className="app-scroll detail-scroll">
          <div className="detail-header">
            <Link href="/" className="back">
              Back
            </Link>
            <div className="det-head">
              <h2>{account ? displayName(account) : "Loading account"}</h2>
              <p>
                {account && detail
                  ? `#${account.account_number} · ${account.server || "Server unavailable"} · report ${formatDateTime(detail.report.reportTimestamp)}`
                  : "Pulling the latest imported report detail."}
              </p>
            </div>
            {detail ? (
              <div className="summary-chip-row">
                <SummaryChip label="Balance" value={formatCompactCurrency(detail.summary.balance)} />
                <SummaryChip label="Net" value={formatCompactCurrency(detail.summary.netProfit)} />
                <SummaryChip label="Results" value={formatCompactNumber(detail.summary.resultCount, 1)} />
                <SummaryChip label="Win Rate" value={formatPercent(detail.summary.winRate, 1)} />
              </div>
            ) : null}
            <nav className="jump-rail" aria-label="Jump to section">
              {[
                { id: "results", label: "results" },
                { id: "trade-stats", label: "trade stats" },
                { id: "trading-history", label: "trading history" },
              ].map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.label}
                </a>
              ))}
            </nav>
          </div>

          <ResultsSection detail={detail} loading={reportDetail.loading} error={reportDetail.error} />
          <TradeStatsSection detail={detail} loading={reportDetail.loading} error={reportDetail.error} />
          <TradingHistorySection
            detail={detail}
            expandedResultId={expandedResultId}
            onToggle={(dealId) => setExpandedResultId((current) => (current === dealId ? null : dealId))}
            loading={reportDetail.loading}
            error={reportDetail.error}
          />
        </div>
      </div>
    </main>
  );
}
