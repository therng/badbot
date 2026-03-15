export type DashboardTimeframe = 'day' | 'week' | 'month' | 'year' | 'all-time';

export interface DealLike {
  time: Date | string;
  type?: string | null;
  profit?: number | null;
  commission?: number | null;
  swap?: number | null;
}

export function parseTimeframe(value: string | null | undefined): DashboardTimeframe {
  switch (value) {
    case 'day':
    case 'week':
    case 'month':
    case 'year':
    case 'all-time':
      return value;
    default:
      return 'month';
  }
}

export function getTimeframeStart(timeframe: DashboardTimeframe, now = new Date()): Date | null {
  switch (timeframe) {
    case 'day':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week': {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      return weekStart;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    case 'all-time':
      return null;
    default:
      return null;
  }
}

export function accountStatusFromTimestamp(
  timestamp: Date | string | null | undefined,
  activeThresholdMinutes = 15
): 'Active' | 'Inactive' {
  if (!timestamp) return 'Inactive';
  const lastUpdatedMs = new Date(timestamp).getTime();
  if (Number.isNaN(lastUpdatedMs)) return 'Inactive';

  const thresholdMs = activeThresholdMinutes * 60 * 1000;
  return Date.now() - lastUpdatedMs <= thresholdMs ? 'Active' : 'Inactive';
}

export function filterByStartDate<T>(
  items: T[],
  getDate: (item: T) => Date | string,
  startDate: Date | null
): T[] {
  if (!startDate) return items;
  const startMs = startDate.getTime();
  return items.filter((item) => new Date(getDate(item)).getTime() >= startMs);
}

export function isBalanceOperation(type: string | null | undefined): boolean {
  return (type ?? '').toLowerCase().includes('balance');
}

export function getDealDelta(deal: DealLike): number {
  return Number(deal.profit ?? 0) + Number(deal.commission ?? 0) + Number(deal.swap ?? 0);
}

export function calculatePeriodGrowth(
  allDeals: DealLike[],
  startDate: Date | null,
  endDate: Date | null = null,
  finalValue?: number
): number {
  if (!allDeals.length) return 0;

  const sortedDeals = [...allDeals].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  let runningBalance = 0;
  if (startDate) {
    for (const deal of sortedDeals) {
      if (new Date(deal.time).getTime() >= startDate.getTime()) {
        break;
      }
      runningBalance += getDealDelta(deal);
    }
  }

  const periodDeals = sortedDeals.filter((deal) => {
    const dealMs = new Date(deal.time).getTime();
    if (startDate && dealMs < startDate.getTime()) return false;
    if (endDate && dealMs > endDate.getTime()) return false;
    return true;
  });

  let k = 1.0;
  let currentBalance = runningBalance;

  for (const deal of periodDeals) {
    const balanceBefore = runningBalance;
    runningBalance += getDealDelta(deal);

    if (isBalanceOperation(deal.type)) {
      if (currentBalance > 0) {
        k *= balanceBefore / currentBalance;
      }
      currentBalance = runningBalance;
    }
  }

  const endBalance = typeof finalValue === 'number' ? finalValue : runningBalance;
  if (currentBalance > 0 && endBalance !== currentBalance) {
    k *= endBalance / currentBalance;
  }

  const growth = (k - 1) * 100;
  return Number.isFinite(growth) ? growth : 0;
}

export function computeStreaks(values: number[]): { bestWinStreak: number; worstLossStreak: number } {
  let bestWinStreak = 0;
  let worstLossStreak = 0;
  let currentWin = 0;
  let currentLoss = 0;

  for (const value of values) {
    if (value > 0) {
      currentWin += 1;
      currentLoss = 0;
    } else if (value < 0) {
      currentLoss += 1;
      currentWin = 0;
    } else {
      currentWin = 0;
      currentLoss = 0;
    }

    bestWinStreak = Math.max(bestWinStreak, currentWin);
    worstLossStreak = Math.max(worstLossStreak, currentLoss);
  }

  return { bestWinStreak, worstLossStreak };
}
