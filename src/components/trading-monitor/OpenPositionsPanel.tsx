import type { PositionsResponse } from "@/lib/trading/types";

import {
  formatPlainNumberValue,
  formatPositionSide,
  formatSignedPlainAmountKpiValue,
  formatTradePrice,
} from "@/components/trading-monitor/DashboardFormatters";
import { toneFromNumber } from "@/components/trading-monitor/formatters";
import { rankOpenPositions } from "@/components/trading-monitor/OpenPositionsOverlay";

export function OpenPositionsPanel({
  positions,
}: {
  positions: PositionsResponse["openPositions"] | null | undefined;
}) {
  const rankedPositions = rankOpenPositions(positions);

  if (!rankedPositions.length) {
    return (
      <div className="open-positions-panel" aria-label="Open positions">
        <div className="trade-history-empty">No open positions right now</div>
      </div>
    );
  }

  return (
    <div className="open-positions-panel" aria-label="Open positions">
      <div className="open-positions-panel__list">
        {rankedPositions.map((position) => (
          <div key={position.positionId} className="open-positions-panel__row">
            <div className="open-positions-panel__lead">
              <strong>{position.symbol}</strong>
              <span>{position.comment?.trim() || formatPositionSide(position.side)}</span>
            </div>
            <div className="open-positions-panel__meta">
              <span>Vol</span>
              <strong>{formatPlainNumberValue(position.volume, 2)}</strong>
            </div>
            <div className="open-positions-panel__meta">
              <span>Mkt</span>
              <strong>{formatTradePrice(position.marketPrice)}</strong>
            </div>
            <div className={`open-positions-panel__trail tone-${toneFromNumber(position.floatingProfit)}`}>
              <span>P/L</span>
              <strong>{formatSignedPlainAmountKpiValue(position.floatingProfit)}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}