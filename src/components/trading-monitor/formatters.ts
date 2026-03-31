"use client";

import type {
  GrowthResponse,
  PositionsResponse,
  SerializedAccount,
  Timeframe,
  WinDetailResponse,
} from "@/lib/trading/types";

const EMPTY_TEXT_VALUES = new Set(["unknown", "n/a", "na", "--"]);

export const TIMEFRAME_OPTIONS: Array<{ value: Timeframe; label: string; ariaLabel: string }> = [
  { value: "1d", label: "1D", ariaLabel: "1 day" },
  { value: "5d", label: "5D", ariaLabel: "5 days" },
  { value: "1m", label: "1M", ariaLabel: "1 month" },
  { value: "3m", label: "3M", ariaLabel: "3 months" },
  { value: "6m", label: "6M", ariaLabel: "6 months" },
  { value: "1y", label: "1Y", ariaLabel: "1 year" },
  { value: "all", label: "ALL", ariaLabel: "All time" },
];

export function normalizeClientTimeframe(value: string | null | undefined): Timeframe {
  switch (value) {
    case "1d":
    case "5d":
    case "1m":
    case "3m":
    case "6m":
    case "1y":
    case "all":
      return value;
    default:
      return "all";
  }
}

export function formatCurrency(value: number | null | undefined, digits = 0) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0)}`;
}

export function formatSignedCurrency(value: number | null | undefined, digits = 0) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = value ?? 0;
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(numeric), digits)}`;
}

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = value ?? 0;
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(digits)}%`;
}

export function formatGrowth(value: number | null | undefined, digits = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = value ?? 0;
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(digits)}`;
}


export function formatNumber(value: number | null | undefined, digits = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

export function formatWholeNumber(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function formatCompactNumber(value: number | null | undefined, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

export function formatCompactCurrency(value: number | null | undefined, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = value ?? 0;
  return `$${formatCompactNumber(Math.abs(numeric), digits).toLowerCase()}`;
}

export function formatCompactSignedCurrency(value: number | null | undefined, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const numeric = value ?? 0;
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${sign}${formatCompactCurrency(numeric, digits)}`;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

export function displayName(account: SerializedAccount) {
  const owner = sanitizeOptionalText(account.owner_name);
  if (!owner) {
    return account.owner_name ?? `#${account.account_number}`;
  }

  const [firstName] = owner.split(" ");
  return firstName || owner;
}

export function toneFromNumber(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "muted";
  }

  if ((value ?? 0) > 0) {
    return "positive";
  }

  if ((value ?? 0) < 0) {
    return "negative";
  }

  return "neutral";
}

export function drawdownTone(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "muted";
  }

  if ((value ?? 0) <= 5) {
    return "positive";
  }

  if ((value ?? 0) <= 15) {
    return "warning";
  }

  return "negative";
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`;
  }

  const commands = [`M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)] ?? points[0]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const following = points[Math.min(points.length - 1, index + 2)] ?? next;
    const controlOneX = current.x + (next.x - previous.x) / 6;
    const controlOneY = current.y + (next.y - previous.y) / 6;
    const controlTwoX = next.x - (following.x - current.x) / 6;
    const controlTwoY = next.y - (following.y - current.y) / 6;

    commands.push(
      `C ${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)} ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)} ${next.x} ${next.y}`,
    );
  }

  return commands.join(" ");
}

export function buildSmoothSegmentPath(points: Array<{ x: number; y: number }>, startIndex: number) {
  if (startIndex < 0 || startIndex >= points.length - 1) {
    return "";
  }

  const previous = points[Math.max(0, startIndex - 1)] ?? points[0];
  const current = points[startIndex];
  const next = points[startIndex + 1];
  const following = points[Math.min(points.length - 1, startIndex + 2)] ?? next;

  if (!previous || !current || !next || !following) {
    return "";
  }

  const controlOneX = current.x + (next.x - previous.x) / 6;
  const controlOneY = current.y + (next.y - previous.y) / 6;
  const controlTwoX = next.x - (following.x - current.x) / 6;
  const controlTwoY = next.y - (following.y - current.y) / 6;

  return [
    `M ${current.x} ${current.y}`,
    `C ${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)} ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)} ${next.x} ${next.y}`,
  ].join(" ");
}

export function buildSparkline(values: number[], width: number, height: number) {
  if (!values.length) {
    return { linePath: "", fillPath: "", points: [] as Array<{ x: number; y: number }> };
  }

  const minimum = Math.min(...values);
  const range = Math.max(...values) - minimum || 1;
  const horizontalInset = Math.min(6, width / 24);
  const plotWidth = Math.max(width - horizontalInset * 2, 1);
  const gap = values.length > 1 ? plotWidth / (values.length - 1) : 0;
  // Keep a bit more room below the line so the curve sits slightly higher in the frame.
  const topInset = Math.min(6, height / 10);
  const bottomInset = Math.min(14, height / 4.5);
  const plotHeight = Math.max(height - topInset - bottomInset, 1);
  const points = values.map((value, index) => ({
    x: Number((horizontalInset + index * gap).toFixed(2)),
    y: Number((topInset + (1 - (value - minimum) / range) * plotHeight).toFixed(2)),
  }));
  const linePath = buildSmoothPath(points);

  return {
    points,
    linePath,
    fillPath: `${linePath} L ${width - horizontalInset} ${height} L ${horizontalInset} ${height} Z`,
  };
}

export function getTotalClosedVolume(positions: PositionsResponse | null | undefined) {
  if (!positions) {
    return 0;
  }

  return Number(positions.summary.dealCount ?? 0) || Number(positions.summary.openCount ?? 0);
}

export function getLeadPosition(positions: PositionsResponse | null | undefined) {
  if (!positions?.openPositions.length) {
    return null;
  }

  return [...positions.openPositions].sort(
    (left, right) => Math.abs(Number(right.floatingProfit ?? 0)) - Math.abs(Number(left.floatingProfit ?? 0)),
  )[0];
}

export function labelBalanceEvent(type: string | null | undefined, delta: number | null | undefined) {
  if ((type ?? "").toLowerCase().includes("balance")) {
    if ((delta ?? 0) > 0) {
      return "Deposit";
    }

    if ((delta ?? 0) < 0) {
      return "Withdrawal";
    }

    return "Balance";
  }

  return type || "Trading";
}

export function summarizeBalanceOperations(
  operations: Array<{ time: string; delta: number }> | null | undefined,
) {
  const list = operations ?? [];
  const initialDeposit = list.find((item) => Number(item.delta ?? 0) > 0) ?? null;
  const deposits = list.reduce((total, item) => {
    const delta = Number(item.delta ?? 0);
    return delta > 0 ? total + delta : total;
  }, 0);
  const withdrawals = list.reduce((total, item) => {
    const delta = Number(item.delta ?? 0);
    return delta < 0 ? total + Math.abs(delta) : total;
  }, 0);

  return {
    initialDeposit: initialDeposit ? Number(initialDeposit.delta ?? 0) : null,
    deposits,
    withdrawals,
  };
}

export function buildGrowthRows(growth: GrowthResponse | null | undefined, account: SerializedAccount | null | undefined) {
  if (!growth?.series.yearly.length) {
    return [];
  }

  const byYear = new Map<number, { deposits: number; withdrawals: number }>();
  for (const operation of growth.balanceOperations) {
    const time = new Date(operation.time);
    if (Number.isNaN(time.getTime())) {
      continue;
    }

    const year = time.getFullYear();
    const current = byYear.get(year) ?? { deposits: 0, withdrawals: 0 };
    const delta = Number(operation.delta ?? 0);
    if (delta > 0) {
      current.deposits += delta;
    } else if (delta < 0) {
      current.withdrawals += Math.abs(delta);
    }
    byYear.set(year, current);
  }

  const currentBalance = Number(account?.balance ?? 0);
  return growth.series.yearly
    .map((row) => {
      const operations = byYear.get(row.year);
      return {
        year: row.year,
        gain: currentBalance > 0 ? (row.value / 100) * currentBalance : null,
        growthPercent: row.value,
        deposits: operations?.deposits ?? null,
        withdrawals: operations?.withdrawals ?? null,
      };
    })
    .sort((left, right) => right.year - left.year);
}

export function computeRecoveryFactor(netProfit: number | null | undefined, maxDrawdown: number | null | undefined) {
  if (!Number.isFinite(maxDrawdown) || !maxDrawdown) {
    return null;
  }

  return Number(netProfit ?? 0) / Number(maxDrawdown);
}

export function computeTradesPerWeek(
  timeframe: Timeframe,
  totalTrades: number | null | undefined,
  positions: PositionsResponse | null | undefined,
) {
  if (!Number.isFinite(totalTrades)) {
    return null;
  }

  let weeks: number | null;
  switch (timeframe) {
    case "1d":
      weeks = 1 / 7;
      break;
    case "5d":
      weeks = 5 / 7;
      break;
    case "1m":
      weeks = 4.35;
      break;
    case "3m":
      weeks = 13;
      break;
    case "6m":
      weeks = 26;
      break;
    case "1y":
      weeks = 52;
      break;
    case "all": {
      weeks = null;
      break;
    }
  }

  return weeks ? Number(totalTrades ?? 0) / weeks : null;
}

export function computeActivityPercent(positions: PositionsResponse | null | undefined, totalTrades: number | null | undefined) {
  if (!positions || !Number.isFinite(totalTrades)) {
    return null;
  }

  const pending = Number(positions.summary.openCount ?? 0);
  const overall = Number(totalTrades ?? 0) + pending;
  return overall ? (pending / overall) * 100 : null;
}

export function hasHistory(positions: PositionsResponse | null | undefined) {
  return Boolean(positions?.recentDeals.length);
}

function sanitizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return EMPTY_TEXT_VALUES.has(normalized.toLowerCase()) ? null : normalized;
}
