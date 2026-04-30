import re

with open("src/components/trading-monitor/DashboardClient.tsx", "r") as f:
    content = f.read()

# Replace the giant ternary in JSX
# Finding the block carefully

start_str = """          {usesCompactKpiPanels && isKpiExpanded("dd") ? ("""
end_str = """          ) : null}
        </div>"""

start_idx = content.find(start_str)
end_idx = content.find(end_str) + len(end_str) - len("\n        </div>")

old_jsx_block = content[start_idx:end_idx]

# Replace in JSX
new_jsx = "          {compactKpiPanel}"
new_content = content[:start_idx] + new_jsx + content[end_idx:]

# Insert logic before return
return_str = "  return (\n    <article className={`card account-card"
return_idx = new_content.find(return_str)

logic_block = """  let compactKpiPanel = null;
  if (usesCompactKpiPanels) {
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
          </div>
        );
        break;
      case "pips":
        compactKpiPanel = (
          <div className="sp-overlay-panel" role="region" aria-label="Pips performance">
            {pipsSummary.error ? (
              <InlineState tone="error" title="Pips data unavailable" message={pipsSummary.error} />
            ) : pipsSummary.loading && !pipsSummary.data ? (
              <div className="skeleton-chart account-card__chart-skeleton" aria-hidden="true" />
            ) : (
              <PipsPerformanceTable rows={pipsSummary.data?.rows ?? []} />
            )}
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
  }

"""

new_content = new_content[:return_idx] + logic_block + new_content[return_idx:]

with open("src/components/trading-monitor/DashboardClient.tsx", "w") as f:
    f.write(new_content)
