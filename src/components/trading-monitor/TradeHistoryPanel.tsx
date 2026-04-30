import { useState } from "react";

import type { PositionsResponse } from "@/lib/trading/types";

import {
  formatPlainNumberValue,
  formatPositionSide,
  formatSignedPlainAmountKpiValue,
  formatTradePrice,
  formatTradeHistoryDateTime,
  getPnlToneClass,
  getSideToneClass,
  positionHistoryNetPnl,
} from "@/components/trading-monitor/DashboardFormatters";

export function TradeHistoryPanel({
  positions,
}: {
  positions: PositionsResponse["historyPositions"] | null | undefined;
}) {
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const historyPositions = [...(positions ?? [])]
    .sort((left, right) => new Date(right.closedAt ?? 0).getTime() - new Date(left.closedAt ?? 0).getTime());

  if (!historyPositions.length) {
    return (
      <div className="trade-history-panel trade-history-panel--list-only" aria-label="Trades list">
        <div className="trade-history-empty">No trades in this timeframe</div>
      </div>
    );
  }

  return (
    <div className="trade-history-panel trade-history-panel--list-only" aria-label="Trades list">
      <div className="trade-history-panel__list">
        {historyPositions.map((position) => {
          const rowKey = position.positionId || `${position.symbol}-${position.closedAt}-${position.volume}`;
          const isExpanded = expandedRowKey === rowKey;
          const sideLabel = formatPositionSide(position.type);
          const volumeLabel = formatPlainNumberValue(position.volume, 2);
          const rowNetPnl = positionHistoryNetPnl(position);
          const sideToneClass = getSideToneClass(sideLabel);
          const pnlToneClass = getPnlToneClass(rowNetPnl);

          return (
            <div key={rowKey} className={isExpanded ? "trade-history-row is-expanded" : "trade-history-row"}>
              <button
                type="button"
                className="trade-history-row__summary"
                aria-expanded={isExpanded}
                onClick={() => setExpandedRowKey((current) => (current === rowKey ? null : rowKey))}
              >
                <div className="trade-history-row__line">
                  <div className="trade-history-row__instrument">
                    <strong>{position.symbol}</strong>
                    <span className={`trade-history-row__side ${sideToneClass}`}>{sideLabel}</span>
                    <span className={`trade-history-row__volume ${sideToneClass}`}>{volumeLabel}</span>
                  </div>
                  <div className={`trade-history-row__trail ${pnlToneClass}`}>
                    <strong>{formatSignedPlainAmountKpiValue(rowNetPnl, 2)}</strong>
                  </div>
                </div>
                <div className="trade-history-row__line trade-history-row__line--secondary">
                  <div className="trade-history-row__prices">
                    <span>{`${formatTradePrice(position.openPrice)} -> ${formatTradePrice(position.closePrice)}`}</span>
                  </div>
                  <div className="trade-history-row__trail trade-history-row__trail--secondary">
                    <span>{formatTradeHistoryDateTime(position.closedAt)}</span>
                  </div>
                </div>
              </button>
              {isExpanded ? (
                <div className="trade-history-row__details trade-history-row__details--2col">
                  <div className="trade-history-row__detail">
                    <span className="trade-history-row__label">∆pip</span>
                    <span className={`trade-history-row__val ${position.pips != null ? getPnlToneClass(position.pips) : ""}`}>{position.pips != null ? formatPlainNumberValue(position.pips, 1) : "—"}</span>
                  </div>
                  <div className="trade-history-row__detail trade-history-row__detail--val-only">
                    <span className="trade-history-row__val">{formatTradeHistoryDateTime(position.openedAt)}</span>
                  </div>
                  <div className="trade-history-row__detail">
                    <span className="trade-history-row__label">S/L</span>
                    <span className="trade-history-row__val trade-history-row__val--white">{formatTradePrice(position.sl)}</span>
                  </div>
                  <div className="trade-history-row__detail">
                    <span className="trade-history-row__label">Swap</span>
                    <span className="trade-history-row__val trade-history-row__val--white">{formatSignedPlainAmountKpiValue(position.swap, 1)}</span>
                  </div>
                  <div className="trade-history-row__detail">
                    <span className="trade-history-row__label">T/P</span>
                    <span className="trade-history-row__val trade-history-row__val--white">{formatTradePrice(position.tp)}</span>
                  </div>
                  <div className="trade-history-row__detail">
                    <span className="trade-history-row__label">Charges</span>
                    <span className="trade-history-row__val trade-history-row__val--white">{formatSignedPlainAmountKpiValue(position.commission, 1)}</span>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
