"use client";
import { memo, useMemo, useRef } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { PositionsResponse } from "@/lib/trading/types";
import { formatSignedCurrency } from "@/components/trading-monitor/formatters";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const SEP_REGEX = /[-_ #[(.]/;
const MANUAL_LABEL = "Manual";
const BOT_LABELS = [
  { label: "Axon", patterns: ["axonshift", "axon"] },
  { label: "QQ", patterns: ["qq"] },
  { label: "BB", patterns: ["bb_return", "bb"] },
  { label: "Full", patterns: ["full throttle", "full"] },
  { label: "Twi", patterns: ["twister", "twist"] },
  { label: "Wall", patterns: ["wall street", "wall"] },
  { label: "Gold", patterns: ["gold house", "gold"] },
  { label: "Aur", patterns: ["aurora", "aur"] },
];

const HASH_ID_REGEX = /^#\d+\|(.+)$/;

const POSITIVE_COLOR = "rgba(52, 211, 153, 0.85)";
const POSITIVE_BORDER = "rgba(52, 211, 153, 1)";
const NEGATIVE_COLOR = "rgba(248, 113, 113, 0.85)";
const NEGATIVE_BORDER = "rgba(248, 113, 113, 1)";

function normalizeBotName(comment: string | null | undefined): string {
  if (!comment) return MANUAL_LABEL;
  const trimmed = comment.trim();
  if (!trimmed) return MANUAL_LABEL;

  const hashMatch = HASH_ID_REGEX.exec(trimmed);
  if (hashMatch) return hashMatch[1].trim() || MANUAL_LABEL;

  const normalized = trimmed.toLowerCase();
  const matched = BOT_LABELS.find(({ patterns }) =>
    patterns.some((pattern) => normalized.startsWith(pattern)),
  );
  if (matched) return matched.label;

  const sepIdx = SEP_REGEX.exec(trimmed)?.index ?? -1;
  const name = (sepIdx === -1 ? trimmed : trimmed.slice(0, sepIdx)).trim();
  return name || MANUAL_LABEL;
}

interface BotStat {
  name: string;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  trades: number;
  wins: number;
  winRate: number;
}

function aggregate(positions: PositionsResponse["historyPositions"] | null | undefined): BotStat[] {
  if (!positions || !positions.length) return [];
  const map = new Map<string, BotStat>();
  for (const pos of positions) {
    const name = normalizeBotName(pos.comment);
    const net = pos.profit + (pos.swap ?? 0) + (pos.commission ?? 0);
    let stat = map.get(name);
    if (!stat) {
      stat = { name, grossProfit: 0, grossLoss: 0, netPnl: 0, trades: 0, wins: 0, winRate: 0 };
      map.set(name, stat);
    }
    if (net >= 0) {
      stat.grossProfit += net;
      stat.wins += 1;
    } else {
      stat.grossLoss += net;
    }
    stat.netPnl += net;
    stat.trades += 1;
  }
  for (const stat of map.values()) {
    stat.winRate = stat.trades > 0 ? stat.wins / stat.trades : 0;
  }
  return Array.from(map.values()).sort((a, b) => b.netPnl - a.netPnl);
}

function formatTick(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const v = value / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const v = value / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return value.toString();
}

interface Props {
  positions: PositionsResponse["historyPositions"] | null | undefined;
}

function BotPnLPanelImpl({ positions }: Props) {
  const bots = useMemo(() => aggregate(positions), [positions]);
  const containerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(
    () => ({
      labels: bots.map((b) => b.name),
      datasets: [
        {
          label: "Profit",
          data: bots.map((b) => b.grossProfit),
          backgroundColor: POSITIVE_COLOR,
          borderColor: POSITIVE_BORDER,
          borderWidth: 0,
          borderRadius: 4,
          borderSkipped: false as const,
          maxBarThickness: 14,
        },
        {
          label: "Loss",
          data: bots.map((b) => Math.abs(b.grossLoss)),
          backgroundColor: NEGATIVE_COLOR,
          borderColor: NEGATIVE_BORDER,
          borderWidth: 0,
          borderRadius: 4,
          borderSkipped: false as const,
          maxBarThickness: 14,
        },
      ],
    }),
    [bots],
  );

  const chartOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "x",
      layout: {
        padding: { top: 8, right: 4, bottom: 0, left: 0 },
      },
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(10, 10, 14, 0.92)",
          borderColor: "rgba(255, 255, 255, 0.13)",
          borderWidth: 0.5,
          padding: 8,
          cornerRadius: 7,
          titleColor: "rgba(255, 255, 255, 0.92)",
          titleFont: { family: "var(--font-mono)", size: 10, weight: 700 },
          bodyFont: { family: "var(--font-mono)", size: 10, weight: 600 },
          bodySpacing: 3,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex ?? 0;
              const bot = bots[idx];
              return bot ? `${bot.name}  •  ${bot.trades} trades` : "";
            },
            label: (ctx) => {
              const idx = ctx.dataIndex;
              const bot = bots[idx];
              if (!bot) return "";
              if (ctx.datasetIndex === 0) {
                return `Profit  ${formatSignedCurrency(bot.grossProfit, 2)}`;
              }
              return `Loss    ${formatSignedCurrency(bot.grossLoss, 2)}`;
            },
            afterBody: (items) => {
              const idx = items[0]?.dataIndex ?? -1;
              const bot = bots[idx];
              if (!bot) return [];
              return [`Net     ${formatSignedCurrency(bot.netPnl, 2)}`];
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false, drawTicks: false },
          border: { display: false, color: "rgba(255, 255, 255, 0.22)" },
          ticks: {
            color: "var(--card-warning)",
            font: { family: "var(--font-mono)", size: 9, weight: 600 },
            padding: 4,
            maxRotation: 0,
            autoSkip: false,
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: (ctx) => (ctx.tick.value === 0 ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.08)"),
            lineWidth: 1,
          },
          border: { display: false },
          ticks: {
            color: "rgba(255, 255, 255, 0.42)",
            font: { family: "var(--font-mono)", size: 8 },
            padding: 4,
            maxTicksLimit: 4,
            callback: (value) => formatTick(typeof value === "number" ? value : Number(value)),
          },
        },
      },
      animation: { duration: 220 },
    }),
    [bots],
  );

  if (!bots.length) {
    return (
      <div className="bot-pnl-panel bot-pnl-panel--empty" role="region" aria-label="Bot performance">
        No bot activity for this timeframe.
      </div>
    );
  }

  return (
    <div className="bot-pnl-panel" role="region" aria-label="Bot performance">
      <div ref={containerRef} className="bot-pnl-frame">
        <div className="bot-pnl-canvas-wrap">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}

export const BotPnLPanel = memo(BotPnLPanelImpl);
