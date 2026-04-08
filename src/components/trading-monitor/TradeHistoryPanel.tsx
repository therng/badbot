import { useState } from "react";

import type { PositionsResponse } from "@/lib/trading/types";

import {
  formatPlainNumberValue,
  formatPositionSide,
  formatSignedPlainAmountKpiValue,
  formatTradePrice,
  formatTradeHistoryDateTime,
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
          const comment = position.comment?.trim() || "-";
          const sideLabel = formatPositionSide(position.type);
          const rowNetPnl = positionHistoryNetPnl(position);
          const normalizedSide = sideLabel.toLowerCase();
          const sideToneClass =
            normalizedSide === "buy" ? "trade-history-row__side--buy" : normalizedSide === "sell" ? "trade-history-row__side--sell" : "";
          const pnlToneClass =
            rowNetPnl > 0 ? "trade-history-row__trail--positive" : rowNetPnl < 0 ? "trade-history-row__trail--negative" : "trade-history-row__trail--neutral";

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
                    <span className={`trade-history-row__volume ${sideToneClass}`}>{formatPlainNumberValue(position.volume, 2)}</span>
                  </div>
                  <div className={`trade-history-row__trail ${pnlToneClass}`}>
                    <strong>{formatSignedPlainAmountKpiValue(rowNetPnl, 2)}</strong>
                  </div>
                </div>
                <div className="trade-history-row__line trade-history-row__line--secondary">
                  <div className="trade-history-row__prices">
                    <span>{`${formatTradePrice(position.openPrice)} -> ${formatTradePrice(position.closePrice)}`}</span>
                    <span className="trade-history-row__comment">{comment}</span>
                  </div>
                  <div className="trade-history-row__trail trade-history-row__trail--secondary">
                    <span>{formatTradeHistoryDateTime(position.closedAt)}</span>
                  </div>
                </div>
              </button>
              {isExpanded ? (
                <div className="trade-history-row__details">
                  <div className="trade-history-row__detail">
                    <span>SL</span>
                    <strong>{formatTradePrice(position.sl)}</strong>
                  </div>
                  <div className="trade-history-row__detail">
                    <span>Swap</span>
                    <strong>{formatSignedPlainAmountKpiValue(position.swap, 1)}</strong>
                  </div>
                  <div className="trade-history-row__detail">
                    <span>TP</span>
                    <strong>{formatTradePrice(position.tp)}</strong>
                  </div>
                  <div className="trade-history-row__detail">
                    <span>Commission</span>
                    <strong>{formatSignedPlainAmountKpiValue(position.commission, 1)}</strong>
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
