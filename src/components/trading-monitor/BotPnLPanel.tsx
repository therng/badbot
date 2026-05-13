"use client";
import { memo, useMemo, useRef, useState } from "react";
import type { PositionsResponse } from "@/lib/trading/types";
import { formatSignedCurrency, formatPercent } from "@/components/trading-monitor/formatters";

const SEP_REGEX = /[-_ #[(.]/;
const MANUAL_LABEL = "Manual";
const BOT_LABELS = [
  { label: "Axon", patterns: ["axonshift", "axon"] },
  { label: "QQ", patterns: ["qq"] },
  { label: "BB", patterns: ["bb_return", "bb"] },
  { label: "Full", patterns: ["full throttle", "full"] },
  { label: "Twi", patterns: ["twister", "twi"] },
  { label: "Wall", patterns: ["wall street", "wall"] },
  { label: "Gold", patterns: ["gold house", "gold"] },
  { label: "Aur", patterns: ["aurora", "aur"] },
];

function normalizeBotName(comment: string | null | undefined): string {
  if (!comment) return MANUAL_LABEL;
  const trimmed = comment.trim();
  if (!trimmed) return MANUAL_LABEL;
  const normalized = trimmed.toLowerCase();
  const matched = BOT_LABELS.find(({ patterns }) =>
    patterns.some((pattern) => normalized.startsWith(pattern)),
  );
  if (matched) return matched.label;

  const sepIdx = trimmed.search(SEP_REGEX);
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

function niceTicks(maxValue: number, count = 2): { ticks: number[]; scaleMax: number } {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return { ticks: [0], scaleMax: 1 };
  const niceMagnitudes = [1, 2, 2.5, 5, 10];
  const raw = maxValue / count;
  const exp = Math.floor(Math.log10(raw));
  const fraction = raw / Math.pow(10, exp);
  const nice = niceMagnitudes.find((m) => m >= fraction) ?? 10;
  const step = nice * Math.pow(10, exp);
  const ticks: number[] = [];
  let v = 0;
  while (v < maxValue + step * 0.0001) {
    ticks.push(v);
    v += step;
  }
  const scaleMax = ticks[ticks.length - 1] || step;
  return { ticks, scaleMax };
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

const ZOOM_LEVELS = [1, 2, 4] as const;
type ZoomLevel = (typeof ZOOM_LEVELS)[number];

interface Props {
  positions: PositionsResponse["historyPositions"] | null | undefined;
}

function BotPnLPanelImpl({ positions }: Props) {
  const bots = useMemo(() => aggregate(positions), [positions]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltipX, setTooltipX] = useState<number>(50);
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const frameRef = useRef<HTMLDivElement>(null);

  const maxAbs = bots.reduce(
    (max, b) => Math.max(max, b.grossProfit, Math.abs(b.grossLoss)),
    0,
  );
  const { ticks, scaleMax } = useMemo(() => niceTicks(maxAbs), [maxAbs]);
  const visibleScaleMax = Math.max(scaleMax / zoom, 1);

  if (!bots.length) {
    return (
      <div className="bot-pnl-panel bot-pnl-panel--empty" role="region" aria-label="Bot performance">
        No bot activity for this timeframe.
      </div>
    );
  }

  const activeBot = activeIndex !== null ? bots[activeIndex] : null;
  const selectedScaleLabel = `${zoom}x`;
  const totalTrades = bots.reduce((sum, b) => sum + b.trades, 0);

  function handleColClick(e: React.MouseEvent<HTMLButtonElement>, idx: number) {
    e.stopPropagation();
    const isActive = activeIndex === idx;
    if (isActive) {
      setActiveIndex(null);
    } else {
      setActiveIndex(idx);
      if (frameRef.current) {
        const frameRect = frameRef.current.getBoundingClientRect();
        const btnRect = e.currentTarget.getBoundingClientRect();
        const center = btnRect.left + btnRect.width / 2 - frameRect.left;
        const pct = (center / frameRect.width) * 100;
        setTooltipX(Math.max(8, Math.min(92, pct)));
      }
    }
  }

  return (
    <div
      className={`bot-pnl-panel${activeBot ? " has-active-bot" : ""}`}
      role="region"
      aria-label="Bot performance"
    >
      <div className="bot-pnl-toolbar">
        <div className="bot-pnl-title">
        <div className="bot-pnl-zoom" aria-label="Zoom range">
          {ZOOM_LEVELS.map((level) => (
            <silder
              key={level}
              type="button"
              className={`bot-pnl-zoom__button${zoom === level ? " is-active" : ""}`}
              aria-pressed={zoom === level}
              onClick={() => setZoom(level)}
            >
              {level}x
            </slider>
          ))}
        </div>
      </div>

      <div ref={frameRef} className="bot-pnl-frame">
        {activeBot && (
          <div
            className="bot-pnl-tooltip"
            style={{
            position: "absolute",
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: "translate(-50%, calc(-100% - 8px))",
            pointerEvents: "none",
            zIndex: 10,
          }}
            aria-live="polite"
          >
            <div className="bot-pnl-tooltip__name">{activeBot.name}</div>
            <div className="bot-pnl-tooltip__rows">
              <span className="bot-pnl-tooltip__profit">{formatSignedCurrency(activeBot.grossProfit, 2)}</span>
              <span className="bot-pnl-tooltip__loss">{formatSignedCurrency(activeBot.grossLoss, 2)}</span>
            </div>
            <div className="bot-pnl-tooltip__meta">
              <span>{formatPercent(activeBot.winRate * 100, 0)} win</span>
              <span>{activeBot.trades}T</span>
            </div>
          </div>
        )}

        <div className="bot-pnl-chart-area">
          <div className="bot-pnl-axis" aria-hidden="true">
            <div className="bot-pnl-axis-inner">
              {ticks
                .filter((t) => t <= visibleScaleMax)
                .map((t) => (
                  <span
                    key={t}
                    className="bot-pnl-tick-label"
                    style={{ bottom: `${(t / visibleScaleMax) * 100}%` }}
                  >
                    {formatTick(t)}
                  </span>
                ))}
              <span className="bot-pnl-tick-label bot-pnl-tick-label--max">
                {selectedScaleLabel}
              </span>
            </div>
          </div>

          <div className="bot-pnl-plot">
            <div className="bot-pnl-gridlines" aria-hidden="true">
              {ticks
                .filter((t) => t <= visibleScaleMax)
                .map((t) => (
                  <div
                    key={t}
                    className={`bot-pnl-gridline${t === 0 ? " bot-pnl-gridline--baseline" : ""}`}
                    style={{ bottom: `${(t / visibleScaleMax) * 100}%` }}
                  />
                ))}
            </div>

            <div className="bot-pnl-scroll" onClick={() => setActiveIndex(null)}>
              <div className="bot-pnl-chart">
                {bots.map((bot, idx) => {
                  const profitPct = Math.min((bot.grossProfit / visibleScaleMax) * 100, 100);
                  const lossPct = Math.min((Math.abs(bot.grossLoss) / visibleScaleMax) * 100, 100);
                  const isActive = activeIndex === idx;
                  return (
                    <button
                      key={bot.name}
                      type="button"
                      className={`bot-pnl-col${isActive ? " is-active" : ""}`}
                      aria-label={`${bot.name}: profit ${bot.grossProfit.toFixed(2)}, loss ${bot.grossLoss.toFixed(2)}, ${bot.trades} trades`}
                      onClick={(e) => handleColClick(e, idx)}
                    >
                      <div className="bot-pnl-col__bars">
                        <div
                          className="bot-pnl-bar bot-pnl-bar--profit"
                          style={{ height: `${profitPct}%` }}
                        />
                        <div
                          className="bot-pnl-bar bot-pnl-bar--loss"
                          style={{ height: `${lossPct}%` }}
                        />
                      </div>
                      <div className="bot-pnl-col__legend">
                        <span className="bot-pnl-col__label" title={bot.name}>
                          {bot.name}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const BotPnLPanel = memo(BotPnLPanelImpl);
