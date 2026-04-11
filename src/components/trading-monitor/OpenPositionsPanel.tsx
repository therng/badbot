import type { PositionsResponse } from "@/lib/trading/types";

import {
  formatPlainNumberValue,
  formatPositionSide,
  formatSignedPlainAmountKpiValue,
  formatTradeHistoryDateTime,
  formatTradePrice,
} from "@/components/trading-monitor/DashboardFormatters";
import { toneFromNumber } from "@/components/trading-monitor/formatters";

function rankOpenPositions(positions: PositionsResponse["openPositions"] | null | undefined) {
  return [...(positions ?? [])].sort((left, right) => {
    const profitDelta = Math.abs(Number(right.floatingProfit ?? 0)) - Math.abs(Number(left.floatingProfit ?? 0));
    if (profitDelta !== 0) {
      return profitDelta;
    }

    return Number(right.volume ?? 0) - Number(left.volume ?? 0);
  });
}

export function OpenPositionsPanel({
  positions,
}: {
  positions: PositionsResponse["openPositions"] | null | undefined;
}) {
  const rankedPositions = rankOpenPositions(positions);

  if (!rankedPositions.length) {
    return (
      <div className="open-positions-panel trade-history-panel trade-history-panel--list-only" aria-label="Open positions">
        <div className="trade-history-empty">No open positions right now</div>
      </div>
    );
  }

  return (
    <div className="open-positions-panel trade-history-panel trade-history-panel--list-only" aria-label="Open positions">
      <div className="trade-history-panel__list">
        {rankedPositions.map((position) => {
          const sideLabel = formatPositionSide(position.side);
          const normalizedSide = sideLabel.toLowerCase();
          const sideToneClass =
            normalizedSide === "buy" ? "trade-history-row__side--buy" : normalizedSide === "sell" ? "trade-history-row__side--sell" : "";
          const comment = position.comment?.trim() || "-";
          const volumeLabel = `${formatPlainNumberValue(position.volume, 2)} lot`;
          const priceRangeLabel = `${formatTradePrice(position.openPrice)} -> ${formatTradePrice(position.marketPrice)}`;

          return (
            <div key={position.positionId} className="trade-history-row">
              <div className="open-positions-panel__summary trade-history-row__summary">
                <div className="trade-history-row__line">
                  <div className="trade-history-row__instrument">
                    <strong>{position.symbol}</strong>
                    <span className={`trade-history-row__side ${sideToneClass}`}>{sideLabel}</span>
                    <span className={`trade-history-row__volume ${sideToneClass}`}>{volumeLabel}</span>
                  </div>
                  <div className={`trade-history-row__trail tone-${toneFromNumber(position.floatingProfit)}`}>
                    <strong>{formatSignedPlainAmountKpiValue(position.floatingProfit)}</strong>
                  </div>
                </div>
                <div className="trade-history-row__line trade-history-row__line--secondary">
                  <div className="trade-history-row__prices">
                    <span className="trade-history-row__comment">{comment}</span>
                    <span>{priceRangeLabel}</span>
                  </div>
                  <div className="trade-history-row__trail trade-history-row__trail--secondary">
                    <span>{formatTradeHistoryDateTime(position.openedAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
