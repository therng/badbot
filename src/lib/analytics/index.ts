export interface EquityPoint {
  time: Date;
  balance: number;
  equity: number;
}

export interface GrowthPoint {
  time: Date;
  growthPercent: number;
}

function isBalanceOperationType(type: unknown): boolean {
  return typeof type === 'string' && type.toLowerCase().includes('balance');
}

// 9. Equity Curve Reconstruction
// Formula: Equity = Balance + Floating P/L
// 10. Equity Curve Algorithm
export function calculateEquityCurve(dealLedger: any[], openPositions: any[]): EquityPoint[] {
  const sortedDeals = [...dealLedger].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  
  const curve: EquityPoint[] = [];
  const floating = openPositions.reduce((sum: number, p: any) => sum + (p.floating_profit || 0), 0);
  
  for (const deal of sortedDeals) {
    const balance = deal.balance_after;
    curve.push({
      time: deal.time,
      balance,
      equity: balance + floating
    });
  }

  return curve;
}

// Equity curve normalized to remove balance operations (deposit/withdraw).
// Drawdown should use this curve so external cashflow does not distort risk metrics.
export function calculateCashflowAdjustedEquityCurve(dealLedger: any[], openPositions: any[]): EquityPoint[] {
  const sortedDeals = [...dealLedger].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const curve: EquityPoint[] = [];
  const floating = openPositions.reduce((sum: number, p: any) => sum + (p.floating_profit || 0), 0);
  let cumulativeBalanceOperations = 0;

  for (const deal of sortedDeals) {
    const dealDelta = (deal.profit || 0) + (deal.commission || 0) + (deal.swap || 0);
    if (isBalanceOperationType(deal.type)) {
      cumulativeBalanceOperations += dealDelta;
    }

    const adjustedBalance = (deal.balance_after || 0) - cumulativeBalanceOperations;
    curve.push({
      time: deal.time,
      balance: adjustedBalance,
      equity: adjustedBalance + floating
    });
  }

  return curve;
}

// 12. Growth Calculation
// K = (Balance before BO1 / Initial Deposit) × (Balance before BO2 / Balance after BO1) × … × (Balance before BOn / Balance after BO(n−1))
export function calculateGrowth(dealLedger: any[], currentEquity?: number): number {
  if (!dealLedger || dealLedger.length === 0) return 0;

  const sortedDeals = [...dealLedger].sort((a, b) => {
    const timeDiff = new Date(a.time).getTime() - new Date(b.time).getTime();
    if (timeDiff !== 0) return timeDiff;
    return (a.deal_id || '').localeCompare(b.deal_id || '');
  });
  
  let currentBalance = 0;
  let runningBalance = 0;
  let k = 1.0;
  let isFirstDeposit = true;

  for (const deal of sortedDeals) {
    const dealChange = (deal.profit || 0) + (deal.commission || 0) + (deal.swap || 0);
    const balanceBefore = runningBalance;
    runningBalance += dealChange;

    const isBalanceOperation = isBalanceOperationType(deal.type);

    if (isBalanceOperation) {
      if (isFirstDeposit) {
        isFirstDeposit = false;
        currentBalance = runningBalance; // initial deposit
      } else {
        if (currentBalance > 0) {
          k *= (balanceBefore / currentBalance);
        }
        currentBalance = runningBalance;
      }
    }
  }

  // The final leg
  const finalValue = currentEquity !== undefined ? currentEquity : runningBalance;
  if (!isFirstDeposit && currentBalance > 0 && finalValue !== currentBalance) {
    k *= (finalValue / currentBalance);
  }

  return (k - 1) * 100;
}

// 13. Year-to-Date Growth
export function calculateYTDGrowth(dealLedger: any[], year: number, currentEquity?: number): number {
  const dealsThisYear = dealLedger.filter(d => new Date(d.time).getFullYear() === year);
  if (dealsThisYear.length === 0) return 0;
  
  // To strictly follow blueprint: Growth Ratio = (Growth % / 100) + 1
  // We compute total growth for the deals this year.
  // We can just use calculateGrowth on the filtered ledger, but we must establish the start balance.
  // A simpler way is to just calculate Growth for the given period.
  
  const sortedDeals = [...dealLedger].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  
  // Find start balance of the year
  let startBalance = 0;
  for (const deal of sortedDeals) {
    if (new Date(deal.time).getFullYear() >= year) break;
    startBalance += (deal.profit || 0) + (deal.commission || 0) + (deal.swap || 0);
  }
  
  let currentBalance = startBalance;
  let runningBalance = startBalance;
  let k = 1.0;

  for (const deal of dealsThisYear) {
    const dealChange = (deal.profit || 0) + (deal.commission || 0) + (deal.swap || 0);
    const balanceBefore = runningBalance;
    runningBalance += dealChange;

    const isBalanceOperation = isBalanceOperationType(deal.type);

    if (isBalanceOperation) {
      if (currentBalance > 0) {
        k *= (balanceBefore / currentBalance);
      }
      currentBalance = runningBalance;
    }
  }

  const finalValue = currentEquity !== undefined ? currentEquity : runningBalance;
  if (currentBalance > 0 && finalValue !== currentBalance) {
    k *= (finalValue / currentBalance);
  }

  return (k - 1) * 100;
}

// 11. Drawdown Calculation
// Drawdown = (peak_equity - current_equity) / peak_equity
export function calculateDrawdown(equityCurve: EquityPoint[]): number {
  if (equityCurve.length === 0) return 0;
  
  let peak = equityCurve[0].equity;
  let maxDrawdown = 0;

  for (const point of equityCurve) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    const currentDrawdown = peak > 0 ? (peak - point.equity) / peak : 0;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }
  }

  return maxDrawdown * 100; // Percentage
}

// 15. KPI Metrics
export function calculateKPIs(dealLedger: any[], closedPositions: any[]) {
  const trades = closedPositions.length;
  const winningTrades = closedPositions.filter(p => p.profit > 0).length;
  const winPercent = trades > 0 ? (winningTrades / trades) * 100 : 0;
  
  const netProfit = dealLedger.reduce((sum, d) => {
    const isBalance = isBalanceOperationType(d.type);
    return sum + (!isBalance ? (d.profit || 0) + (d.commission || 0) + (d.swap || 0) : 0);
  }, 0);
  
  return {
    trades,
    winPercent,
    netProfit
  };
}
