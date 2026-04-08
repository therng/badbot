import type { AccountOverviewResponse, PositionsResponse } from "@/lib/trading/types";

import {
  formatPlainNumberValue,
  formatPositionSide,
  formatSignedPlainAmountKpiValue,
} from "@/components/trading-monitor/DashboardFormatters";
import { toneFromNumber } from "@/components/trading-monitor/formatters";

export function rankOpenPositions(positions: PositionsResponse["openPositions"] | AccountOverviewResponse["openPositions"] | null | undefined) {
  return [...(positions ?? [])].sort((left, right) => {
    const profitDelta = Math.abs(Number(right.floatingProfit ?? 0)) - Math.abs(Number(left.floatingProfit ?? 0));
    if (profitDelta !== 0) {
      return profitDelta;
    }

    return Number(right.volume ?? 0) - Number(left.volume ?? 0);
  });
}

export function OpenPositionsOverlay({
  positions,
}: {
  positions: AccountOverviewResponse["openPositions"] | null | undefined;
}) {
  const rankedPositions = rankOpenPositions(positions)
    .slice(0, 4);

  if (!rankedPositions.length) {
    return null;
  }

  const hiddenCount = Math.max(0, (positions?.length ?? 0) - rankedPositions.length);

  return (
    <div className="open-overlay" aria-label="Open positions summary">
      <div className="open-overlay__header">
        <span>Open positions</span>
        <strong>{positions?.length ?? rankedPositions.length} live</strong>
      </div>

      <div className="open-overlay__list">
        {rankedPositions.map((position) => (
          <div key={position.positionId} className="open-overlay__row">
            <div className="open-overlay__identity">
              <strong>{position.symbol}</strong>
              <span>{formatPositionSide(position.side)}</span>
            </div>

            <div className="open-overlay__metric">
              <span>Vol</span>
              <strong>{formatPlainNumberValue(position.volume, 2)}</strong>
            </div>

            <div className="open-overlay__metric">
              <span>Mkt</span>
              <strong>{formatPlainNumberValue(position.marketPrice, 5)}</strong>
            </div>

            <div className={`open-overlay__metric tone-${toneFromNumber(position.floatingProfit)}`}>
              <span>P/L</span>
              <strong>{formatSignedPlainAmountKpiValue(position.floatingProfit)}</strong>
            </div>
          </div>
        ))}
      </div>

      {hiddenCount > 0 ? <div className="open-overlay__footer">+{hiddenCount} more positions</div> : null}
    </div>
  );
}