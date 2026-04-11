import { type PipsSummaryRow } from "@/lib/trading/types";
import {
  formatCompactNumber,
  formatPercent,
  formatSignedCurrency,
  toneFromNumber,
} from "@/components/trading-monitor/formatters";
import { formatSignedPlainNumberValue } from "@/components/trading-monitor/DashboardFormatters";

export function PipsPerformanceTable({
  rows,
}: {
  rows: PipsSummaryRow[];
}) {
  if (!rows.length) {
    return null;
  }

  return (
    <section className="pips-performance" aria-label="Pips performance summary">
      <div className="pips-performance__table-shell">
        <table className="pips-performance__table">
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Pips</th>
              <th scope="col">Vol.</th>
              <th scope="col">Profit</th>
              <th scope="col">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className={`tone-${toneFromNumber(row.pips)}`}>
                  {formatSignedPlainNumberValue(row.pips, 1)}
                </td>
                <td>
                  {formatCompactNumber(row.volume, 1)}
                </td>
                <td className={`tone-${toneFromNumber(row.profit)}`}>
                  {formatSignedCurrency(row.profit, 2)}
                </td>
                <td className={`tone-${toneFromNumber(row.growth)}`}>
                  {formatPercent(row.growth, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
