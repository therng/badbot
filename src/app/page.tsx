'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { getFirstName } from '@/lib/utils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Filler,
  type ScriptableContext
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Filler
);

type Timeframe = 'day' | 'week' | 'month' | 'year' | 'all-time';
type Screen = 'dashboard' | 'positions' | 'history' | 'accounts' | 'detail';
type DetailType = 'profit' | 'risk' | 'win' | 'equity';
type DetailKey = 'profit' | 'equity' | 'win' | 'positions' | 'growth';
interface AccountHeader {
  id: string;
  account_number: string;
  owner_name: string | null;
  currency: string;
  server: string;
  account_mode: string | null;
  position_mode: string | null;
  status: 'Active' | 'Inactive';
  last_updated: string | null;
  balance: number;
  equity: number;
  floating_pl: number;
  margin_level: number | null;
}

interface OverviewResponse {
  timeframe: Timeframe;
  account: AccountHeader;
  kpis: {
    trades: number;
    winPercent: number;
    netProfit: number;
    drawdown: number;
    growth: number;
    equity: number;
  };
  equityCurve: Array<{ x: string; y: number }>;
}

interface DetailEnvelope {
  timeframe: Timeframe;
  account: AccountHeader;
}

interface ProfitDetailResponse extends DetailEnvelope {
  summary: {
    trades: number;
    netProfit: number;
    grossProfit: number;
    grossLoss: number;
    commissionTotal: number;
    swapTotal: number;
    avgTradePnL: number;
    bestTrade: number;
    worstTrade: number;
    profitFactor: number | null;
  };
  bySymbol: Array<{ symbol: string; trades: number; netProfit: number; avgTrade: number; winRate: number }>;
  recentTrades: Array<{
    positionId: string;
    symbol: string;
    side: string;
    volume: number;
    openedAt: string;
    closedAt: string;
    pnl: number;
  }>;
}

interface EquityDetailResponse extends DetailEnvelope {
  summary: {
    points: number;
    currentEquity: number;
    peakEquity: number;
    minEquity: number;
    maxDrawdown: number;
  };
  equityCurve: Array<{ x: string; equity: number; balance: number }>;
  drawdownCurve: Array<{ x: string; y: number }>;
}

interface WinDetailResponse extends DetailEnvelope {
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number;
    lossRate: number;
    avgWin: number;
    avgLoss: number;
    expectancy: number;
    bestWinStreak: number;
    worstLossStreak: number;
  };
  bySymbol: Array<{ symbol: string; trades: number; netProfit: number; winRate: number }>;
  bySide: Array<{ side: string; trades: number; netProfit: number; winRate: number }>;
  outcomeSeries: Array<{ x: string; y: number }>;
}

interface GrowthDetailResponse extends DetailEnvelope {
  summary: {
    periodGrowth: number;
    ytdGrowth: number;
    allTimeGrowth: number;
  };
  series: {
    monthly: Array<{ month: string; value: number }>;
    yearly: Array<{ year: number; value: number }>;
  };
  balanceOperations: Array<{ time: string; type: string; delta: number }>;
}

interface PositionsDetailResponse extends DetailEnvelope {
  summary: {
    openCount: number;
    workingCount: number;
    closedCount: number;
    openVolume: number;
    floatingProfit: number;
    realizedProfit: number;
  };
  openPositions: Array<{
    positionId: string;
    symbol: string;
    side: string;
    volume: number;
    openPrice: number;
    marketPrice: number;
    floatingProfit: number;
  }>;
  workingOrders: Array<{
    orderId: string;
    symbol: string;
    type: string;
    volume: number;
    price: number;
    state?: string;
  }>;
  openBySymbol: Array<{
    symbol: string;
    count: number;
    volume: number;
    floatingProfit: number;
  }>;
  recentClosedPositions: Array<{
    positionId: string;
    symbol: string;
    side: string;
    volume: number;
    openedAt: string;
    closedAt: string;
    openPrice: number;
    closePrice: number;
    pnl: number;
  }>;
}

type PositionEntry = PositionsDetailResponse['openPositions'][number] & { account: AccountHeader };

const DETAIL_ENDPOINTS: Record<DetailKey, string> = {
  profit: 'profit-detail',
  equity: 'equity-detail',
  win: 'win-detail',
  positions: 'positions',
  growth: 'growth'
};

const TIMEFRAME_VALUES: Timeframe[] = ['day', 'week', 'month', 'year', 'all-time'];
const TIMEFRAME_BUTTONS: Array<{ value: Timeframe; label: string; ariaLabel: string }> = [
  { value: 'day', label: 'D', ariaLabel: 'Day' },
  { value: 'week', label: 'W', ariaLabel: 'Week' },
  { value: 'month', label: 'M', ariaLabel: 'Month' },
  { value: 'year', label: 'Y', ariaLabel: 'Year' },
  { value: 'all-time', label: 'A', ariaLabel: 'All time' }
];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REPORT_ACTIVE_THRESHOLD_MINUTES = 15;
const CHART_COLORS = ['#C8A96E', '#00D4A4', '#7EB8F7', '#FF6B6B', '#A78BFA'];
const TOOLTIP_THEME = {
  backgroundColor: '#10141e',
  borderColor: 'rgba(200,190,160,0.22)',
  borderWidth: 1,
  bodyColor: '#e8e4da',
  titleColor: 'rgba(232,228,218,0.55)',
  bodyFont: { family: 'Azeret Mono', size: 11 },
  titleFont: { family: 'Azeret Mono', size: 11 }
};

function formatMoneyPlain(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '--';

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatSignedMoneyPlain(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${formatMoneyPlain(Math.abs(value), digits)}`;
}

function formatCountValue(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return new Intl.NumberFormat(undefined, {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

function formatRelativeAge(value: string | null): string {
  if (!value) return 'Awaiting sync';
  const diff = Math.round((Date.now() - Date.parse(value)) / 60000);
  if (diff < 2) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.round(diff / 60)}h ago`;
}

function isFreshStatus(value: string | null, activeThresholdMinutes = REPORT_ACTIVE_THRESHOLD_MINUTES): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= activeThresholdMinutes * 60 * 1000;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDateShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === 'string') {
      return message;
    }
  }

  return fallback;
}

function isTimeframe(value: string | null): value is Timeframe {
  return value !== null && TIMEFRAME_VALUES.includes(value as Timeframe);
}

function getAccountTimeframeStorageKey(accountId: string): string {
  return `badbot:account-timeframe:${accountId}`;
}

function getSignedClass(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value >= 0 ? 'pos' : 'neg';
}

function getDrawdownClass(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (value <= 5) return 'pos';
  if (value <= 15) return 'warn';
  return 'neg';
}

function pct(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return 0;
  return Math.min(100, Math.round((Math.abs(value) / total) * 100));
}

function useAccountOverview(accountId: string, timeframe: Timeframe, refreshToken: number) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetch(`/api/accounts/${accountId}?timeframe=${timeframe}`, { signal: controller.signal })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(getApiErrorMessage(payload, 'Failed to load overview'));
        }

        if (!cancelled) {
          setData(payload as OverviewResponse);
        }
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load overview');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accountId, timeframe, refreshToken]);

  return { data, loading, error };
}

function useDetailData<T>(
  accountId: string,
  key: DetailKey,
  timeframe: Timeframe,
  enabled: boolean,
  refreshToken: number
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !accountId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setData(null);
    setError(null);
    setLoading(true);

    fetch(`/api/accounts/${accountId}/${DETAIL_ENDPOINTS[key]}?timeframe=${timeframe}`, { signal: controller.signal })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(getApiErrorMessage(payload, 'Failed to load detail'));
        }

        if (!cancelled) {
          setData(payload as T);
        }
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load detail');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accountId, key, timeframe, enabled, refreshToken]);

  return { data, loading, error };
}

function usePositionsAggregate(accounts: AccountHeader[], enabled: boolean) {
  const [data, setData] = useState<PositionsDetailResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || accounts.length === 0) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadPositions = async () => {
      try {
        setLoading(true);
        setError(null);

        const responses = await Promise.all(
          accounts.map(async (account) => {
            const res = await fetch(`/api/accounts/${account.id}/positions?timeframe=month`, {
              signal: controller.signal
            });
            const payload = await res.json().catch(() => null);

            if (!res.ok) {
              throw new Error(getApiErrorMessage(payload, 'Failed to load positions'));
            }

            return payload as PositionsDetailResponse;
          })
        );

        if (!cancelled) {
          setData(responses);
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load positions');
        setData([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPositions();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accounts, enabled]);

  return { data, loading, error };
}

function Sparkline({ values, color, ariaLabel }: { values: number[]; color: string; ariaLabel: string }) {
  const series = values.filter((value) => Number.isFinite(value));

  if (series.length === 0) return null;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min;
  const padding = range > 0 ? range * 0.08 : Math.max(Math.abs(max) * 0.08, 1);

  const data = {
    labels: series.map((_, i) => i.toString()),
    datasets: [
      {
        data: series,
        borderColor: color,
        borderWidth: 1.5,
        tension: 0.4,
        pointRadius: 0,
        fill: true,
        backgroundColor: (context: ScriptableContext<'line'>) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, `${color}12`);
          gradient.addColorStop(1, `${color}00`);
          return gradient;
        }
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    },
    scales: {
      x: { display: false },
      y: { display: false, min: min - padding, max: max + padding }
    },
    animation: { duration: 300 }
  };

  return (
    <div className="sparkline-wrap" role="img" aria-label={ariaLabel} style={{ width: '100%', height: '100%' }}>
      <Line data={data} options={options} />
    </div>
  );
}

const AccountCard = memo(function AccountCard({
  account,
  timeframe,
  onTimeframeChange,
  onOpenDetail,
  showYtd,
  onToggleYtd
}: {
  account: AccountHeader;
  timeframe: Timeframe;
  onTimeframeChange: (value: Timeframe) => void;
  onOpenDetail: (type: DetailType) => void;
  showYtd: boolean;
  onToggleYtd: () => void;
}) {
  const [overviewRefreshToken, setOverviewRefreshToken] = useState(0);
  const { data: overview, loading, error } = useAccountOverview(account.id, timeframe, overviewRefreshToken);
  const displayName = getFirstName(account.owner_name) ?? account.owner_name ?? `Account #${account.account_number}`;
  const isActiveStatus = isFreshStatus(account.last_updated);
  const growthValue = overview ? overview.kpis.growth : 0;
  const growthText = overview ? formatPercent(growthValue, 1) : '--';
  const growthColor = growthValue >= 0 ? '#00D4A4' : '#FF6B6B';
  const balanceValue = overview?.account.balance ?? account.balance;
  const brokerLabel = account.server || account.account_mode || 'Broker';
  const chartValues = overview?.equityCurve.length
    ? overview.equityCurve.map((point) => point.y)
    : [account.balance, account.equity];
  const sparklineSummary = `Equity trend for ${displayName}. Latest ${formatMoneyPlain(chartValues[chartValues.length - 1], 0)}.`;

  return (
    <div className="card">
      <div className="acc-header">
        <div>
          <div className="acc-name">
            <span className={`sdot${isActiveStatus ? ' live' : ''}`} />
            <span className="acc-name-text">{displayName}</span>
          </div>
          <div className="acc-sub">#{account.account_number} · {account.currency}</div>
          <div className="acc-sub" style={{ marginTop: 1, color: 'var(--text-3)' }}>
            Bal ${formatMoneyPlain(balanceValue, 0)}
          </div>
        </div>
        <span className="broker-tag">{brokerLabel}</span>
      </div>

      <div className="sp-wrap">
        <div className="sp-top">
          <span className="sp-balance">Equity ${formatMoneyPlain(overview?.kpis.equity ?? account.equity, 0)}</span>
          <span className="sp-growth" style={{ color: growthColor }}>
            {growthText}
            <span className="sp-dot" style={{ background: growthColor }} />
          </span>
        </div>
        <div className="sp-canvas" style={{ position: 'relative', height: 58 }}>
          {loading ? (
            <div className="chart-placeholder" />
          ) : (
            <Sparkline values={chartValues} color={growthColor} ariaLabel={sparklineSummary} />
          )}
        </div>
        <div className="tf-row">
          {TIMEFRAME_BUTTONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`tb${timeframe === option.value ? ' on' : ''}`}
              aria-label={option.ariaLabel}
              onClick={() => onTimeframeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {showYtd ? (
        <div className="ytd-section">
          <YtdTable accountId={account.id} />
        </div>
      ) : null}

      <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 10 }}>
        {error ? (
          <div style={{ fontSize: 11, color: 'var(--rose)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>{error}</span>
            <button type="button" className="tb" onClick={() => setOverviewRefreshToken((token) => token + 1)}>
              Retry
            </button>
          </div>
        ) : (
          <div className="kgrid">
            <button type="button" className="kchip" onClick={() => onOpenDetail('profit')}>
              <div className="kl">Profit</div>
              <div className={`kv ${overview ? getSignedClass(overview.kpis.netProfit) : ''}`}>
                {overview ? formatSignedMoneyPlain(overview.kpis.netProfit, 0) : '--'}
              </div>
            </button>
            <button type="button" className="kchip" onClick={() => onOpenDetail('risk')}>
              <div className="kl">Drawdown</div>
              <div className={`kv ${overview ? getDrawdownClass(overview.kpis.drawdown) : ''}`}>
                {overview ? `${overview.kpis.drawdown.toFixed(1)}%` : '--'}
              </div>
            </button>
            <button type="button" className="kchip" onClick={() => onOpenDetail('win')}>
              <div className="kl">Win %</div>
              <div className="kv blue">{overview ? `${overview.kpis.winPercent.toFixed(1)}%` : '--'}</div>
            </button>
            <button type="button" className="kchip" onClick={onToggleYtd}>
              <div className="kl">Trades</div>
              <div className="kv gold">
                {overview ? formatCountValue(overview.kpis.trades) : '--'}
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

function YtdTable({ accountId }: { accountId: string }) {
  const { data, loading, error } = useDetailData<GrowthDetailResponse>(accountId, 'growth', 'year', true, 0);

  if (loading) {
    return <p style={{ fontSize: 10, color: '#6B7280' }}>Loading YTD growth...</p>;
  }

  if (error) {
    return <p style={{ fontSize: 10, color: '#F87171' }}>{error}</p>;
  }

  if (!data) return null;

  const yearRows = [...data.series.yearly].sort((a, b) => a.year - b.year);
  const currentYear = new Date().getFullYear();
  const monthlyMap = new Map(data.series.monthly.map((entry) => [entry.month, entry.value]));
  const grandTotal = yearRows.reduce((sum, row) => sum + row.value, 0);

  return (
    <>
      <p className="ytd-label">
        Year-to-date growth
      </p>
      <div className="ytd-wrap">
        <table className="ytd">
          <thead>
            <tr>
              <th className="row-lbl" style={{ textAlign: 'left', color: 'var(--text-3)' }}>Year</th>
              {MONTH_LABELS.map((month) => (
                <th key={month}>{month}</th>
              ))}
              <th className="th-yr">Total</th>
            </tr>
          </thead>
          <tbody>
            {yearRows.map((row) => (
              <tr key={row.year}>
                <td className="row-lbl">{row.year}</td>
                {MONTH_LABELS.map((month) => {
                  const value = row.year === currentYear ? monthlyMap.get(month) ?? null : null;
                  if (value === null || value === undefined) {
                    return (
                      <td key={month} style={{ color: 'var(--text-3)' }}>
                        –
                      </td>
                    );
                  }
                  return (
                    <td key={month} className={value >= 0 ? 'pos' : 'neg'}>
                      {value >= 0 ? '+' : ''}{Math.round(value).toLocaleString()}
                    </td>
                  );
                })}
                <td className={`yr-col ${row.value >= 0 ? 'pos' : 'neg'}`}>
                  {row.value >= 0 ? '+' : ''}{Math.round(row.value).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={13} style={{ paddingTop: 8, fontSize: 9, color: 'var(--text-3)', textAlign: 'right', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
                Grand total
              </td>
              <td className="yr-col" style={{ paddingTop: 8, fontWeight: 500, color: grandTotal >= 0 ? 'var(--mint)' : 'var(--rose)' }}>
                {grandTotal >= 0 ? '+' : ''}{Math.round(grandTotal).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function DashboardScreen({
  accounts,
  loading,
  error,
  timeframes,
  onTimeframeChange,
  onOpenDetail,
  ytdOpen,
  onToggleYtd
}: {
  accounts: AccountHeader[];
  loading: boolean;
  error: string | null;
  timeframes: Record<string, Timeframe>;
  onTimeframeChange: (accountId: string, timeframe: Timeframe) => void;
  onOpenDetail: (accountId: string, type: DetailType) => void;
  ytdOpen: Record<string, boolean>;
  onToggleYtd: (accountId: string) => void;
}) {
  const latestSync = accounts
    .map((account) => account.last_updated)
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => b - a)[0];

  const lastSyncLabel = latestSync ? formatRelativeAge(new Date(latestSync).toISOString()) : 'Awaiting sync';
  const isLive = accounts.some((account) => isFreshStatus(account.last_updated));

  return (
    <div style={{ paddingBottom: 8 }}>
      <div className="dash-head">
        <div>
          <h2>Trading<br /><em>Monitor</em></h2>
          <p>MT5 · Last sync {lastSyncLabel}</p>
        </div>
        <span className="live-badge">{isLive ? '● live' : 'idle'}</span>
      </div>

      {loading ? (
        <div className="card">
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>Loading accounts...</p>
        </div>
      ) : error ? (
        <div className="card">
          <p style={{ fontSize: 12, color: '#F87171', marginBottom: 8 }}>{error}</p>
          <button type="button" className="tb" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="card">
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>No accounts available yet. Import a report to populate the dashboard.</p>
        </div>
      ) : (
        accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            timeframe={timeframes[account.id] ?? 'month'}
            onTimeframeChange={(value) => onTimeframeChange(account.id, value)}
            onOpenDetail={(type) => onOpenDetail(account.id, type)}
            showYtd={Boolean(ytdOpen[account.id])}
            onToggleYtd={() => onToggleYtd(account.id)}
          />
        ))
      )}
    </div>
  );
}

function PositionsScreen({
  data,
  loading,
  error
}: {
  data: PositionsDetailResponse[];
  loading: boolean;
  error: string | null;
}) {
  const openPositions = useMemo(() => {
    return data.flatMap((entry) =>
      entry.openPositions.map((position) => ({
        ...position,
        account: entry.account
      }))
    );
  }, [data]);

  const totalFloat = openPositions.reduce((sum, position) => sum + Number(position.floatingProfit ?? 0), 0);

  const worstFloat = openPositions.reduce((min, position) => Math.min(min, Number(position.floatingProfit ?? 0)), 0);
  const drawdownValue = worstFloat < 0 ? Math.abs(worstFloat) : 0;
  const winRate = openPositions.length
    ? (openPositions.filter((position) => Number(position.floatingProfit ?? 0) >= 0).length / openPositions.length) * 100
    : 0;

  const lastPosition = useMemo(() => {
    if (!openPositions.length) return null;
    const sorted = [...openPositions].sort((a, b) => {
      const aId = Number(a.positionId);
      const bId = Number(b.positionId);
      if (!Number.isNaN(aId) && !Number.isNaN(bId)) {
        return aId - bId;
      }
      return a.positionId.localeCompare(b.positionId);
    });
    return sorted[sorted.length - 1] ?? null;
  }, [openPositions]);

  const overlayLive = Boolean(lastPosition && isFreshStatus(lastPosition.account.last_updated));

  return (
    <div className="positions-screen">
      <div className="positions-content">
        <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 3 }}>Open positions</h2>
        <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 14 }}>
          {openPositions.length} open · Float:{' '}
          <span className={getSignedClass(totalFloat)}>
            {totalFloat >= 0 ? '+$' : '-$'}{Math.abs(totalFloat).toFixed(2)}
          </span>
        </p>

        {loading ? (
          <div className="card">
            <p style={{ fontSize: 12, color: '#9CA3AF' }}>Loading positions...</p>
          </div>
        ) : error ? (
          <div className="card">
            <p style={{ fontSize: 12, color: '#F87171' }}>{error}</p>
          </div>
        ) : openPositions.length === 0 ? (
          <div className="card">
            <p style={{ fontSize: 12, color: '#9CA3AF' }}>No open positions.</p>
          </div>
        ) : (
          openPositions.map((position) => {
            const sideLabel = position.side ?? '--';
            const sideClass = sideLabel.toLowerCase() === 'buy' ? 'tag-buy' : 'tag-sell';

            return (
              <div key={`${position.account.id}-${position.positionId}`} className="card" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{position.symbol}</span>
                    <span className={`tag ${sideClass}`}>{sideLabel}</span>
                    <span style={{ fontSize: 11, color: '#6B7280' }}>{Number(position.volume).toFixed(2)}</span>
                  </div>
                  <span className={getSignedClass(position.floatingProfit)} style={{ fontSize: 14, fontWeight: 500, fontFamily: 'var(--mono)' }}>
                    {position.floatingProfit >= 0 ? '+$' : '-$'}{Math.abs(position.floatingProfit).toFixed(2)}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 2, fontFamily: 'var(--mono)' }}>
                  {Number(position.openPrice).toFixed(5)} → {Number(position.marketPrice).toFixed(5)}
                </p>
                <p style={{ fontSize: 10, color: '#4B5563' }}>{getFirstName(position.account.owner_name) ?? position.account.account_number}</p>
              </div>
            );
          })
        )}
      </div>
      {lastPosition ? (
        <LastPositionOverlay
          position={lastPosition}
          totalFloat={totalFloat}
          winRate={winRate}
          drawdownValue={drawdownValue}
          tradeCount={openPositions.length}
          isLive={overlayLive}
        />
      ) : null}
    </div>
  );
}

function LastPositionOverlay({
  position,
  totalFloat,
  winRate,
  drawdownValue,
  tradeCount,
  isLive
}: {
  position: PositionEntry;
  totalFloat: number;
  winRate: number;
  drawdownValue: number;
  tradeCount: number;
  isLive: boolean;
}) {
  const [range, setRange] = useState<Timeframe>('day');
  const gradientId = useMemo(() => `overlay-sparkline-${position.positionId}`, [position.positionId]);

  const changePercent = useMemo(() => {
    const open = Number(position.openPrice ?? 0);
    const market = Number(position.marketPrice ?? open);
    if (!Number.isFinite(open) || open === 0) return 0;
    return ((market - open) / open) * 100;
  }, [position.openPrice, position.marketPrice]);

  const sparklinePoints = useMemo(() => {
    const open = Number(position.openPrice ?? 0);
    const market = Number(position.marketPrice ?? open);
    const mid = (open + market) / 2;
    const series = [open, mid, market];
    const min = Math.min(...series);
    const max = Math.max(...series);
    const rangeValue = max - min || Math.abs(max) || 1;
    return series
      .map((value, index) => {
        const x = (index / (series.length - 1)) * 100;
        const normalized = ((value - min) / rangeValue) * 100;
        return `${x},${100 - normalized}`;
      })
      .join(' ');
  }, [position.openPrice, position.marketPrice]);

  const ownerLabel = getFirstName(position.account.owner_name) ?? position.account.account_number ?? 'Account';
  const drawdownLabel = drawdownValue > 0 ? formatSignedMoneyPlain(-drawdownValue, 0) : '$0';

  const statEntries = useMemo(
    () => [
      { label: 'Profit', value: formatSignedMoneyPlain(totalFloat, 0), className: getSignedClass(totalFloat) },
      { label: 'Drawdown', value: drawdownLabel, className: drawdownValue > 0 ? 'neg' : '' },
      { label: 'Win %', value: `${winRate.toFixed(0)}%`, className: winRate >= 50 ? 'pos' : 'neg' },
      { label: 'Trades', value: tradeCount.toString(), className: '' }
    ],
    [totalFloat, drawdownValue, drawdownLabel, winRate, tradeCount]
  );

  return (
    <div className="last-position-overlay" aria-live="polite">
      <div className="overlay-header">
        <span className="overlay-owner" title={ownerLabel}>{ownerLabel}</span>
        <span className={`overlay-percent ${changePercent >= 0 ? 'pos' : 'neg'}`}>{formatPercent(changePercent, 1)}</span>
      </div>
      <div className="overlay-account-line">
        <span className="overlay-account">#{position.account.account_number}</span>
        <div className="overlay-sparkline" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#C8A96E" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#00D4A4" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline points={sparklinePoints} fill="none" stroke={`url(#${gradientId})`} strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span
            className={`overlay-live-dot ${position.floatingProfit >= 0 ? 'positive' : 'negative'} ${isLive ? 'live' : ''}`}
            aria-label={isLive ? 'Open position live' : 'Open position idle'}
          />
        </div>
      </div>
      <div className="overlay-volume-line">
        <span className="overlay-volume">{position.side?.toUpperCase() ?? '--'} · {Number(position.volume).toFixed(2)} lots</span>
        <span className={`overlay-open-value ${changePercent >= 0 ? 'pos' : 'neg'}`}>
          {formatSignedMoneyPlain(position.floatingProfit ?? 0, 0)}
        </span>
      </div>
      <div className="overlay-times" role="group" aria-label="Resolution">
        {TIMEFRAME_BUTTONS.map((option) => (
          <button
            key={`overlay-time-${option.value}`}
            type="button"
            className={`overlay-time-toggle${range === option.value ? ' on' : ''}`}
            onClick={() => setRange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="overlay-stats">
        {statEntries.map((stat) => (
          <button key={stat.label} type="button" className={`overlay-stat ${stat.className}`}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryScreen({
  data,
  loading,
  error,
  expandedTrade,
  onToggleTrade
}: {
  data: PositionsDetailResponse[];
  loading: boolean;
  error: string | null;
  expandedTrade: string | null;
  onToggleTrade: (tradeId: string) => void;
}) {
  const trades = useMemo(() => {
    return data
      .flatMap((entry) =>
        entry.recentClosedPositions.map((trade) => ({
          ...trade,
          account: entry.account
        }))
      )
      .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
  }, [data]);

  return (
    <div style={{ paddingBottom: 16 }}>
      <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 3 }}>Trading history</h2>
      <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 14 }}>All accounts · Closed positions · Tap to expand</p>
      <div className="card" style={{ padding: '0 14px' }}>
        {loading ? (
          <div className="trow">
            <p style={{ fontSize: 12, color: '#9CA3AF' }}>Loading trades...</p>
          </div>
        ) : error ? (
          <div className="trow">
            <p style={{ fontSize: 12, color: '#F87171' }}>{error}</p>
          </div>
        ) : trades.length === 0 ? (
          <div className="trow">
            <p style={{ fontSize: 12, color: '#9CA3AF' }}>No closed positions yet.</p>
          </div>
        ) : (
          trades.map((trade) => {
            const tradeKey = `${trade.account.id}-${trade.positionId}`;
            const isOpen = expandedTrade === tradeKey;
            const delta = Number(trade.closePrice) - Number(trade.openPrice);
            const deltaPct = Number(trade.openPrice)
              ? (delta / Number(trade.openPrice)) * 100
              : 0;
            const sideLabel = trade.side ?? '--';
            const sideClass = sideLabel.toLowerCase() === 'buy' ? 'tag-buy' : 'tag-sell';

            return (
              <div
                key={tradeKey}
                className="trow"
                onClick={() => onToggleTrade(tradeKey)}
                role="button"
              >
                {isOpen ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 500 }}>{trade.symbol}</span>
                          <span className={`tag ${sideClass}`}>{sideLabel}</span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>{Number(trade.volume).toFixed(2)}</span>
                        </div>
                        <p style={{ fontSize: 11, color: '#6B7280' }}>{getFirstName(trade.account.owner_name) ?? trade.account.account_number}</p>
                      </div>
                      <span style={{ fontSize: 10, color: '#4B5563' }}>#{trade.positionId}</span>
                    </div>
                    <div style={{ borderTop: '0.5px solid #2A2F3A', borderBottom: '0.5px solid #2A2F3A', padding: '8px 0', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#E5E7EB' }}>
                          {Number(trade.openPrice).toFixed(5)} → {Number(trade.closePrice).toFixed(5)}
                        </span>
                        <span className={getSignedClass(trade.pnl)} style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--mono)' }}>
                          {trade.pnl >= 0 ? '+$' : '-$'}{Math.abs(trade.pnl).toFixed(2)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          Δ = {delta >= 0 ? '+' : ''}{delta.toFixed(5)} ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%)
                        </span>
                        <span style={{ fontSize: 11, color: '#6B7280' }}>collapse</span>
                      </div>
                      <p style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{formatDateTime(trade.openedAt)}</p>
                      <p style={{ fontSize: 11, color: '#6B7280' }}>→ {formatDateTime(trade.closedAt)}</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[
                        ['S/L', '--'],
                        ['Swap', '--'],
                        ['T/P', '--'],
                        ['Charges', '--']
                      ].map(([label, value]) => (
                        <div key={label} style={{ fontSize: 12 }}>
                          <span style={{ color: '#9CA3AF' }}>{label}: </span>
                          <span style={{ fontFamily: 'var(--mono)', color: '#E5E7EB' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{trade.symbol}</span>
                        <span className={`tag ${sideClass}`}>{sideLabel}</span>
                        <span style={{ fontSize: 11, color: '#6B7280' }}>{Number(trade.volume).toFixed(2)}</span>
                      </div>
                      <span className={getSignedClass(trade.pnl)} style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--mono)' }}>
                        {trade.pnl >= 0 ? '+$' : '-$'}{Math.abs(trade.pnl).toFixed(2)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: '#6B7280', fontFamily: 'var(--mono)' }}>
                        {Number(trade.openPrice).toFixed(5)} → {Number(trade.closePrice).toFixed(5)}
                      </span>
                      <span style={{ fontSize: 11, color: '#4B5563' }}>{formatDateShort(trade.closedAt)} ▾</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const AccountSummaryCard = memo(function AccountSummaryCard({
  account,
  timeframe
}: {
  account: AccountHeader;
  timeframe: Timeframe;
}) {
  const { data: overview } = useAccountOverview(account.id, timeframe, 0);
  const displayName = getFirstName(account.owner_name) ?? account.owner_name ?? `Account #${account.account_number}`;
  const isActiveStatus = isFreshStatus(account.last_updated);

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`sdot${isActiveStatus ? ' live' : ''}`} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>{displayName}</p>
            <p style={{ fontSize: 11, color: '#6B7280' }}>
              #{account.account_number} · {account.server} · {account.currency}
            </p>
          </div>
        </div>
        <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.1)', color: '#22C55E', padding: '3px 8px', borderRadius: 6 }}>
          {isActiveStatus ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 20, paddingTop: 10, borderTop: '0.5px solid #2A2F3A' }}>
        <div>
          <p style={{ fontSize: 10, color: '#6B7280' }}>Profit</p>
          <p className={overview ? getSignedClass(overview.kpis.netProfit) : ''} style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--mono)' }}>
            {overview ? formatSignedMoneyPlain(overview.kpis.netProfit, 0) : '--'}
          </p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#6B7280' }}>Equity</p>
          <p style={{ fontSize: 13, fontWeight: 500 }}>
            {overview ? `$${formatMoneyPlain(overview.kpis.equity, 0)}` : '--'}
          </p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#6B7280' }}>Win %</p>
          <p className="blue" style={{ fontSize: 13, fontWeight: 500 }}>
            {overview ? `${overview.kpis.winPercent.toFixed(1)}%` : '--'}
          </p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#6B7280' }}>DD</p>
          <p className={overview ? getDrawdownClass(overview.kpis.drawdown) : ''} style={{ fontSize: 13, fontWeight: 500 }}>
            {overview ? `${overview.kpis.drawdown.toFixed(1)}%` : '--'}
          </p>
        </div>
      </div>
    </div>
  );
});

function AccountsScreen({ accounts, timeframes }: { accounts: AccountHeader[]; timeframes: Record<string, Timeframe> }) {
  return (
    <div style={{ paddingBottom: 16 }}>
      <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 3 }}>Accounts</h2>
      <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 14 }}>{accounts.length} connected</p>
      {accounts.length === 0 ? (
        <div className="card">
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>No accounts available.</p>
        </div>
      ) : (
        accounts.map((account) => (
          <AccountSummaryCard key={account.id} account={account} timeframe={timeframes[account.id] ?? 'month'} />
        ))
      )}
    </div>
  );
}

function DetailScreen({
  account,
  timeframe,
  detailType,
  onBack,
  onTimeframeChange
}: {
  account: AccountHeader;
  timeframe: Timeframe;
  detailType: DetailType;
  onBack: () => void;
  onTimeframeChange: (timeframe: Timeframe) => void;
}) {
  const detailKey: DetailKey = detailType === 'risk' ? 'equity' : detailType;
  const [refreshToken, setRefreshToken] = useState(0);
  const { data, loading, error } = useDetailData<unknown>(account.id, detailKey, timeframe, true, refreshToken);
  const titleMap: Record<DetailType, string> = {
    profit: 'Profit detail',
    risk: 'Risk & drawdown',
    win: 'Win statistics',
    equity: 'Equity detail'
  };

  return (
    <div style={{ paddingBottom: 16 }}>
      <button className="back" onClick={onBack} type="button">
        <span aria-hidden="true">‹</span> Back
      </button>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: '#E5E7EB' }}>{titleMap[detailType]}</h2>
        <p style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
          {getFirstName(account.owner_name) ?? account.owner_name ?? account.account_number} · #{account.account_number}
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 12 }}>
        {TIMEFRAME_BUTTONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`tb${timeframe === option.value ? ' on' : ''}`}
            onClick={() => onTimeframeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card">
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>Loading detail...</p>
        </div>
      ) : error ? (
        <div className="card">
          <p style={{ fontSize: 12, color: '#F87171', marginBottom: 8 }}>{error}</p>
          <button type="button" className="tb" onClick={() => setRefreshToken((token) => token + 1)}>
            Retry
          </button>
        </div>
      ) : detailType === 'profit' && data ? (
        <ProfitDetail data={data as ProfitDetailResponse} />
      ) : detailType === 'equity' && data ? (
        <EquityDetail data={data as EquityDetailResponse} />
      ) : detailType === 'risk' && data ? (
        <RiskDetail accountId={account.id} timeframe={timeframe} data={data as EquityDetailResponse} />
      ) : detailType === 'win' && data ? (
        <WinDetail data={data as WinDetailResponse} />
      ) : (
        <div className="card">
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>Detail not available.</p>
        </div>
      )}
    </div>
  );
}

function ProfitDetail({ data }: { data: ProfitDetailResponse }) {
  const summary = data.summary;
  const topSymbols = data.bySymbol.slice(0, 5);
  const maxAbs = Math.max(1, ...topSymbols.map((entry) => Math.abs(entry.netProfit)));

  const pieData = {
    labels: topSymbols.map((entry) => entry.symbol),
    datasets: [
      {
        data: topSymbols.map((entry) => Math.abs(entry.netProfit)),
        backgroundColor: CHART_COLORS.slice(0, topSymbols.length),
        borderWidth: 0,
        hoverOffset: 3
      }
    ]
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_THEME
      }
    }
  };

  const summaryRows: Array<{ label: string; value: string; className: string }> = [
    { label: 'Total profit', value: formatSignedMoneyPlain(summary.grossProfit, 0), className: 'pos' },
    { label: 'Commission', value: formatSignedMoneyPlain(summary.commissionTotal, 0), className: 'neg' },
    { label: 'Swap', value: formatSignedMoneyPlain(summary.swapTotal, 0), className: 'neg' },
    { label: 'Total loss', value: formatSignedMoneyPlain(-Math.abs(summary.grossLoss), 0), className: 'neg' },
    { label: 'Net profit', value: formatSignedMoneyPlain(summary.netProfit, 0), className: getSignedClass(summary.netProfit) }
  ];

  return (
    <>
      <div className="card">
        <p className="slbl">Summary</p>
        {summaryRows.map((row) => (
          <div key={row.label} className="mrow">
            <span className="ml">{row.label}</span>
            <span className={`mv ${row.className}`}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <p className="slbl">Symbol mix</p>
        <div style={{ height: 150, position: 'relative' }}>
          {topSymbols.length ? <Doughnut data={pieData} options={pieOptions} /> : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {topSymbols.map((entry, index) => (
            <span key={entry.symbol} style={{ fontSize: 10, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[index], display: 'inline-block' }} />
              {entry.symbol}
            </span>
          ))}
        </div>
      </div>
      <div className="card">
        <p className="slbl">Profit by symbol</p>
        {topSymbols.map((entry) => (
          <div key={entry.symbol} style={{ marginBottom: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: '#E5E7EB', fontWeight: 500 }}>{entry.symbol}</span>
              <span className={getSignedClass(entry.netProfit)} style={{ fontFamily: 'var(--mono)' }}>
                {formatSignedMoneyPlain(entry.netProfit, 0)}
              </span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${pct(entry.netProfit, maxAbs)}%`,
                  background: entry.netProfit >= 0 ? '#22C55E' : '#EF4444'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function EquityDetail({ data }: { data: EquityDetailResponse }) {
  const labels = data.equityCurve.map((point) =>
    new Date(point.x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const equityData = data.equityCurve.map((point) => point.equity);
  const balanceData = data.equityCurve.map((point) => point.balance);
  const floating = data.summary.currentEquity - data.account.balance;

  const lineData = {
    labels,
    datasets: [
      {
        label: 'Equity',
        data: equityData,
        borderColor: '#38BDF8',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4
      },
      {
        label: 'Balance',
        data: balanceData,
        borderColor: '#6B7280',
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.3,
        borderDash: [4, 3]
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        ...TOOLTIP_THEME
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(42,47,58,0.6)' },
        ticks: { color: '#6B7280', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 5 }
      },
      y: {
        grid: { color: 'rgba(42,47,58,0.6)' },
        ticks: {
          color: '#6B7280',
          font: { size: 10 },
          callback: (value: number | string) => `$${Number(value).toLocaleString()}`
        }
      }
    }
  };

  return (
    <>
      <div className="card">
        <p className="slbl">Balance vs equity</p>
        <div style={{ height: 170, position: 'relative', marginBottom: 8 }}>
          <Line data={lineData} options={lineOptions} />
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#9CA3AF' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 14, height: 2, background: '#38BDF8', display: 'inline-block', borderRadius: 1 }} />
            Equity
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 14, borderTop: '2px dashed #6B7280', display: 'inline-block' }} />
            Balance
          </span>
        </div>
      </div>
      <div className="card">
        {[
          ['Balance', `$${formatMoneyPlain(data.account.balance, 0)}`, ''],
          ['Equity', `$${formatMoneyPlain(data.summary.currentEquity, 0)}`, 'blue'],
          ['Floating P/L', formatSignedMoneyPlain(floating, 0), getSignedClass(floating)],
          ['Peak equity', `$${formatMoneyPlain(data.summary.peakEquity, 0)}`, ''],
          ['Min equity', `$${formatMoneyPlain(data.summary.minEquity, 0)}`, 'warn'],
          ['Max drawdown', `${data.summary.maxDrawdown.toFixed(1)}%`, getDrawdownClass(data.summary.maxDrawdown)]
        ].map(([label, value, cls]) => (
          <div key={label} className="mrow">
            <span className="ml">{label}</span>
            <span className={`mv ${cls}`}>{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function RiskDetail({ accountId, timeframe, data }: { accountId: string; timeframe: Timeframe; data: EquityDetailResponse }) {
  const { data: profitData } = useDetailData<ProfitDetailResponse>(accountId, 'profit', timeframe, true, 0);
  const { data: winData } = useDetailData<WinDetailResponse>(accountId, 'win', timeframe, true, 0);
  const relativeDrawdown = data.summary.maxDrawdown;
  const absoluteDrawdown = Math.max(0, data.summary.peakEquity - data.summary.currentEquity);
  const maximalDrawdown = (relativeDrawdown / 100) * data.summary.peakEquity;
  const ddPx = Math.min((relativeDrawdown / 20) * 100, 98);
  const depLoad = Math.min(95, Math.round(relativeDrawdown * 5.5));
  const bestTrade = profitData?.summary.bestTrade ?? 0;
  const worstTrade = profitData?.summary.worstTrade ?? 0;
  const maxTrade = Math.max(1, Math.abs(bestTrade), Math.abs(worstTrade));

  return (
    <>
      <div className="card">
        <p className="slbl">Drawdown summary</p>
        {[
          ['Absolute drawdown', `$${formatMoneyPlain(absoluteDrawdown, 0)}`, ''],
          ['Relative drawdown', `${relativeDrawdown.toFixed(1)}%`, getDrawdownClass(relativeDrawdown)],
          ['Maximal drawdown', `$${formatMoneyPlain(maximalDrawdown, 0)}`, 'warn']
        ].map(([label, value, cls]) => (
          <div key={label} className="mrow">
            <span className="ml">{label}</span>
            <span className={`mv ${cls}`}>{value}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <p className="slbl">Risk gauges</p>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#9CA3AF' }}>Max drawdown</span>
            <span style={{ fontFamily: 'var(--mono)', color: '#E5E7EB' }}>{relativeDrawdown.toFixed(2)}%</span>
          </div>
          <div className="risk-bar">
            <div className="risk-dot" style={{ left: `${ddPx}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4B5563', marginTop: 2 }}>
            <span>0%</span>
            <span>10%</span>
            <span>20%</span>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#9CA3AF' }}>Max deposit load</span>
            <span style={{ fontFamily: 'var(--mono)', color: '#E5E7EB' }}>{depLoad}%</span>
          </div>
          <div className="risk-bar">
            <div className="risk-dot" style={{ left: `${Math.min(depLoad, 98)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4B5563', marginTop: 2 }}>
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <div className="card">
        <p className="slbl">Trade extremes</p>
        {([
          ['Best trade', formatSignedMoneyPlain(bestTrade, 0), '#22C55E', pct(bestTrade, maxTrade)],
          ['Worst trade', formatSignedMoneyPlain(worstTrade, 0), '#EF4444', pct(worstTrade, maxTrade)]
        ] as Array<[string, string, string, number]>).map(([label, value, color, width]) => (
          <div key={label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: '#9CA3AF' }}>{label}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color }}>{value}</span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${width}%`, background: color }} />
            </div>
          </div>
        ))}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: '#9CA3AF' }}>Max consecutive wins</span>
            <span className="mv pos">{winData?.summary.bestWinStreak ?? '--'}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: '65%', background: '#22C55E' }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: '#9CA3AF' }}>Max consecutive losses</span>
            <span className="mv neg">{winData?.summary.worstLossStreak ?? '--'}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: '72%', background: '#EF4444' }} />
          </div>
        </div>
      </div>
    </>
  );
}

function WinDetail({ data }: { data: WinDetailResponse }) {
  const totalTrades = Math.max(1, data.summary.totalTrades);
  const longSide = data.bySide.find((entry) => /buy|long/i.test(entry.side ?? ''));
  const shortSide = data.bySide.find((entry) => /sell|short/i.test(entry.side ?? ''));
  const longTrades = longSide?.trades ?? 0;
  const shortTrades = shortSide?.trades ?? Math.max(0, totalTrades - longTrades);

  const barData = {
    labels: ['Long', 'Short'],
    datasets: [
      {
        data: [longTrades, shortTrades],
        backgroundColor: ['#3B82F6', '#F97316'],
        borderRadius: 3,
        borderSkipped: false
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_THEME
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#6B7280', font: { size: 10 } } },
      y: { grid: { color: 'rgba(42,47,58,0.6)' }, ticks: { color: '#6B7280', font: { size: 10 } } }
    }
  };

  return (
    <>
      <div className="card">
        <p className="slbl">Direction</p>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: '#3B82F6' }}>Long trades</span>
            <span style={{ color: '#3B82F6', fontFamily: 'var(--mono)', fontWeight: 500 }}>{longTrades}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${pct(longTrades, totalTrades)}%`, background: '#3B82F6' }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: '#F97316' }}>Short trades</span>
            <span style={{ color: '#F97316', fontFamily: 'var(--mono)', fontWeight: 500 }}>{shortTrades}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${pct(shortTrades, totalTrades)}%`, background: '#F97316' }} />
          </div>
        </div>
      </div>
      <div className="card">
        <p className="slbl">Results</p>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: '#22C55E' }}>Profit trades</span>
            <span className="mv pos">{data.summary.wins}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${pct(data.summary.wins, totalTrades)}%`, background: '#22C55E' }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: '#EF4444' }}>Loss trades</span>
            <span className="mv neg">{data.summary.losses}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${pct(data.summary.losses, totalTrades)}%`, background: '#EF4444' }} />
          </div>
        </div>
      </div>
      <div className="card">
        <p className="slbl">Long / Short by period</p>
        <div style={{ height: 150, position: 'relative' }}>
          <Bar data={barData} options={barOptions} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: '#9CA3AF' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#3B82F6', display: 'inline-block' }} />
            Long
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#F97316', display: 'inline-block' }} />
            Short
          </span>
        </div>
      </div>
      <div className="card">
        <p className="slbl">Streaks</p>
        {[
          ['Best win streak', data.summary.bestWinStreak, 'pos'],
          ['Worst loss streak', data.summary.worstLossStreak, 'neg']
        ].map(([label, value, cls]) => (
          <div key={label} className="mrow">
            <span className="ml">{label}</span>
            <span className={`mv ${cls}`}>{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function BottomNav({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  const activeScreen = active === 'detail' ? 'dashboard' : active;

  return (
    <div className="bnav">
      <button
        className={`bni${activeScreen === 'dashboard' ? ' on' : ''}`}
        onClick={() => onNavigate('dashboard')}
        type="button"
      >
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
        Dashboard
      </button>
      <button
        className={`bni${activeScreen === 'positions' ? ' on' : ''}`}
        onClick={() => onNavigate('positions')}
        type="button"
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l2.5 2.5" />
        </svg>
        Positions
      </button>
      <button
        className={`bni${activeScreen === 'history' ? ' on' : ''}`}
        onClick={() => onNavigate('history')}
        type="button"
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h10M4 18h7" />
        </svg>
        History
      </button>
      <button
        className={`bni${activeScreen === 'accounts' ? ' on' : ''}`}
        onClick={() => onNavigate('accounts')}
        type="button"
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
        Accounts
      </button>
    </div>
  );
}

export default function TradingMonitorPage() {
  const [accounts, setAccounts] = useState<AccountHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
  const [detailType, setDetailType] = useState<DetailType>('profit');
  const [timeframes, setTimeframes] = useState<Record<string, Timeframe>>({});
  const [ytdOpen, setYtdOpen] = useState<Record<string, boolean>>({});
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);

  const positionsEnabled = screen === 'positions' || screen === 'history';
  const { data: positionsData, loading: positionsLoading, error: positionsError } = usePositionsAggregate(accounts, positionsEnabled);

  useEffect(() => {
    let isDisposed = false;

    const loadAccounts = async () => {
      try {
        setAccountsError(null);
        const res = await fetch('/api/accounts', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Failed to fetch accounts (${res.status})`);
        }

        const data = (await res.json()) as AccountHeader[];
        if (isDisposed) return;

        setAccounts(data);
      } catch (error) {
        if (!isDisposed) {
          console.error('Failed to load accounts:', error);
          setAccountsError(error instanceof Error ? error.message : 'Failed to load accounts');
        }
      } finally {
        if (!isDisposed) {
          setLoading(false);
        }
      }
    };

    loadAccounts();
    const intervalId = window.setInterval(loadAccounts, 30000);
    const onFocus = () => loadAccounts();
    window.addEventListener('focus', onFocus);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setTimeframes((prev) => {
      const next = { ...prev };
      accounts.forEach((account) => {
        if (!next[account.id]) {
          const stored = window.localStorage.getItem(getAccountTimeframeStorageKey(account.id));
          next[account.id] = isTimeframe(stored) ? stored : 'month';
        }
      });
      return next;
    });
  }, [accounts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    Object.entries(timeframes).forEach(([accountId, timeframe]) => {
      window.localStorage.setItem(getAccountTimeframeStorageKey(accountId), timeframe);
    });
  }, [timeframes]);

  const detailAccount = useMemo(
    () => accounts.find((account) => account.id === detailAccountId) ?? null,
    [accounts, detailAccountId]
  );

  const handleOpenDetail = (accountId: string, type: DetailType) => {
    setDetailAccountId(accountId);
    setDetailType(type);
    setScreen('detail');
  };

  const handleNavigate = (nextScreen: Screen) => {
    setScreen(nextScreen);
    if (nextScreen !== 'detail') {
      setDetailAccountId(null);
    }
  };

  return (
    <div className="app" id="app">
      <div className="scroll" id="main-scroll">
        {screen === 'dashboard' ? (
          <DashboardScreen
            accounts={accounts}
            loading={loading}
            error={accountsError}
            timeframes={timeframes}
            onTimeframeChange={(accountId, timeframe) =>
              setTimeframes((prev) => ({
                ...prev,
                [accountId]: timeframe
              }))
            }
            onOpenDetail={handleOpenDetail}
            ytdOpen={ytdOpen}
            onToggleYtd={(accountId) =>
              setYtdOpen((prev) => ({
                ...prev,
                [accountId]: !prev[accountId]
              }))
            }
          />
        ) : null}

        {screen === 'positions' ? (
          <PositionsScreen data={positionsData} loading={positionsLoading} error={positionsError} />
        ) : null}

        {screen === 'history' ? (
          <HistoryScreen
            data={positionsData}
            loading={positionsLoading}
            error={positionsError}
            expandedTrade={expandedTrade}
            onToggleTrade={(tradeId) =>
              setExpandedTrade((current) => (current === tradeId ? null : tradeId))
            }
          />
        ) : null}

        {screen === 'accounts' ? (
          <AccountsScreen accounts={accounts} timeframes={timeframes} />
        ) : null}

        {screen === 'detail' && detailAccount ? (
          <DetailScreen
            account={detailAccount}
            timeframe={timeframes[detailAccount.id] ?? 'month'}
            detailType={detailType}
            onBack={() => handleNavigate('dashboard')}
            onTimeframeChange={(value) =>
              setTimeframes((prev) => ({
                ...prev,
                [detailAccount.id]: value
              }))
            }
          />
        ) : null}
      </div>
      <BottomNav active={screen} onNavigate={handleNavigate} />
    </div>
  );
}
