import { type CalendarMonthlyPerformanceYear } from "@/lib/trading/types";
import {
  formatMonthlyCellValue,
  formatMonthlySummaryValue,
  toneFromMonthlyValue,
  type MonthlyDisplayMode,
} from "@/components/trading-monitor/DashboardFormatters";
import { type MetricTone, toneFromNumber } from "@/components/trading-monitor/formatters";

export function MonthlyPerformanceTable({
  years,
  totalGrowthPercent,
  totalNetAmount,
  mode,
  onToggle,
}: {
  years: CalendarMonthlyPerformanceYear[];
  totalGrowthPercent: number | null | undefined;
  totalNetAmount: number | null | undefined;
  mode: MonthlyDisplayMode;
  onToggle: () => void;
}) {
  if (!years.length) {
    return null;
  }

  const summaryPrimary = mode === "percent" ? totalGrowthPercent : totalNetAmount;
  const summarySecondary = mode === "percent" ? totalNetAmount : totalGrowthPercent;
  const secondaryLabel = mode === "percent" ? "Net" : "Growth";
  const secondaryMode: MonthlyDisplayMode = mode === "percent" ? "amount" : "percent";

  return (
    <section className="monthly-performance" aria-label="Yearly monthly performance">
      <div className="monthly-performance__header">
        <div>
          <span className="monthly-performance__eyebrow">YTD Monthly</span>
          <strong className="monthly-performance__title">Calendar segments</strong>
        </div>
        <button
          type="button"
          className="monthly-performance__toggle"
          onClick={onToggle}
          aria-label={`Switch monthly table to ${mode === "percent" ? "amount" : "percent"} view`}
        >
          Amt/%
        </button>
      </div>

      <div className="monthly-performance__table-shell">
        <table className="monthly-performance__table">
          <thead>
            <tr>
              <th scope="col">Year</th>
              {years[0]?.months.map((month) => (
                <th key={month.label} scope="col">
                  {month.label}
                </th>
              ))}
              <th scope="col" className="monthly-performance__sticky-col">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year.year}>
                <th scope="row">{year.year}</th>
                {year.months.map((cell) => (
                  <td
                    key={`${year.year}-${cell.month}`}
                    className={`tone-${toneFromMonthlyValue(mode === "percent" ? cell.growthPercent : cell.netAmount, mode)}`}
                  >
                    {formatMonthlyCellValue(cell, mode)}
                  </td>
                ))}
                <td
                  className={`monthly-performance__sticky-col tone-${toneFromMonthlyValue(
                    mode === "percent" ? year.totalGrowthPercent : year.totalNetAmount,
                    mode,
                  )}`}
                >
                  {formatMonthlySummaryValue(mode === "percent" ? year.totalGrowthPercent : year.totalNetAmount, mode)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="monthly-performance__summary">
        <div>
          <span>Total</span>
          <strong className={`tone-${toneFromMonthlyValue(summaryPrimary, mode)}`}>
            {formatMonthlySummaryValue(summaryPrimary, mode)}
          </strong>
        </div>
        <div>
          <span>{secondaryLabel}</span>
          <strong className={`tone-${toneFromMonthlyValue(summarySecondary, secondaryMode)}`}>
            {formatMonthlySummaryValue(summarySecondary, secondaryMode)}
          </strong>
        </div>
      </div>
    </section>
  );
}