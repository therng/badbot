import { type MetricTone } from "@/components/trading-monitor/formatters";
import { ExpandableKpiKey } from "@/components/trading-monitor/DashboardFormatters";

export function SummaryChip({
  label,
  value,
  tone = "neutral",
  meta,
  fullValue,
  onClick,
  isSelected = false,
}: {
  label: string;
  value: string;
  tone?: MetricTone;
  meta?: string;
  fullValue?: string;
  onClick?: () => void;
  isSelected?: boolean;
}) {
  const tooltip = fullValue ? `${label}: ${fullValue}` : undefined;
  const interactive = Boolean(onClick);
  const className = `kchip ${interactive ? "is-actionable" : "is-static"} ${isSelected ? "is-selected" : ""}`.trim();

  if (!interactive) {
    return (
      <div className={className} title={tooltip} aria-label={tooltip}>
        <span className="kl">{label}</span>
        <strong className={`kv tone-${tone}`}>{value}</strong>
        {meta ? <span className="kchip__meta">{meta}</span> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={isSelected}
      onClick={onClick}
    >
      <span className="kl">{label}</span>
      <strong className={`kv tone-${tone}`}>{value}</strong>
      {meta ? <span className="kchip__meta">{meta}</span> : null}
    </button>
  );
}