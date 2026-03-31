export type Timeframe = "1d" | "5d" | "1m" | "3m" | "6m" | "1y" | "all";

export interface SerializedAccount {
  id: string;
  account_number: string;
  owner_name: string | null;
  currency: string;
  server: string;
  status: "Active" | "Inactive";
  last_updated: Date | null;
  balance: number;
  equity: number;
  floating_pl: number;
  margin_level: number | null;
}

export interface ChartPoint {
  x: string;
  y: number;
}

export interface BalanceEventPoint extends ChartPoint {
  balance: number;
  eventType: string | null;
  eventDelta: number | null;
}

export interface AccountOverviewResponse {
  timeframe: Timeframe;
  account: SerializedAccount;
  kpis: {
    periodGrowth: number;
    netProfit: number;
    drawdown: number;
    absoluteDrawdown: number;
    winPercent: number;
    trades: number;
    floatingPL: number;
    openCount: number;
  };
  balanceCurve: BalanceEventPoint[];
}

export interface BalanceDetailResponse {
  timeframe: Timeframe;
  account: SerializedAccount;
  summary: {
    absoluteDrawdown: number | null;
    relativeDrawdownPct: number | null;
    maximalDrawdownAmount: number | null;
    maximalDrawdownPct: number | null;
    averageLossTrade: number | null;
    maximalDepositLoad: number | null;
    maximumConsecutiveLossAmount: number | null;
  };
  mfeMae: {
    available: boolean;
    reason: string;
    mfe: null;
    mae: null;
  };
  balanceCurve: BalanceEventPoint[];
  drawdownCurve: ChartPoint[];
}

export interface GrowthResponse {
  timeframe: Timeframe;
  account: SerializedAccount;
  summary: {
    periodGrowth: number;
    ytdGrowth: number;
    allTimeGrowth: number;
    absoluteGain: number;
    periodLabel: string;
  };
  series: {
    monthly: Array<{ month: string; value: number }>;
    yearly: Array<{ year: number; value: number }>;
  };
  balanceOperations: Array<{
    time: string;
    type: string | null;
    delta: number;
  }>;
}

export interface PositionsResponse {
  timeframe: Timeframe;
  account: SerializedAccount;
  summary: {
    dealCount: number;
    totalTrades: number;
    tradeActivityPercent: number | null;
    tradesPerWeek: number | null;
    longTradeWin: number | null;
    shortTradeWin: number | null;
    averageHoldHours: number | null;
    profitFactor: number | null;
    recoveryFactor: number | null;
    sharpeRatio: number | null;
    expectedPayoff: number | null;
    maxConsecutiveProfitAmount: number | null;
    maxConsecutiveLossAmount: number | null;
    symbolTradePercent: Array<{
      symbol: string;
      percent: number;
    }>;
    openCount: number;
    floatingProfit: number;
  };
  openPositions: Array<{
    positionId: string;
    openedAt: Date | null;
    symbol: string;
    side: string;
    volume: number;
    openPrice: number;
    sl: number | null;
    tp: number | null;
    marketPrice: number;
    floatingProfit: number;
    swap: number;
    comment: string | null;
  }>;
  workingOrders: Array<{
    orderId: string;
    openedAt: Date | null;
    symbol: string;
    type: string;
    volume: number;
    price: number;
    sl: number | null;
    tp: number | null;
    marketPrice: number | null;
    state: string;
    comment: string | null;
  }>;
  openBySymbol: Array<{
    symbol: string;
    count: number;
    volume: number;
    floatingProfit: number;
  }>;
  recentDeals: Array<{
    dealId: string;
    symbol: string;
    side: string;
    volume: number;
    time: Date;
    price: number | null;
    pnl: number;
  }>;
}

export interface ProfitDetailResponse {
  timeframe: Timeframe;
  account: SerializedAccount;
  summary: {
    netProfit: number;
    grossProfit: number;
    grossLoss: number;
    totalCommission: number;
    totalSwap: number;
    totalDeposit: number;
    totalWithdrawal: number;
    profitFactor: number | null;
    dailyProfit: Array<{
      date: string;
      profit: number;
    }>;
  };
  bySymbol: Array<{
    symbol: string;
    trades: number;
    netProfit: number;
    avgTrade: number;
    winRate: number;
  }>;
  recentDeals: Array<{
    dealId: string;
    symbol: string;
    side: string;
    volume: number;
    time: Date;
    price: number | null;
    pnl: number;
  }>;
}

export interface WinDetailResponse {
  timeframe: Timeframe;
  account: SerializedAccount;
  summary: {
    winRate: number;
    wins: number;
    losses: number;
    longTradeWin: number | null;
    shortTradeWin: number | null;
    largestProfitTrade: number | null;
    largestLossTrade: number | null;
    sharpeRatio: number | null;
    profitFactor: number | null;
    recoveryFactor: number | null;
    expectedPayoff: number | null;
    maximumConsecutiveWins: number | null;
    maximumConsecutiveLosses: number | null;
    maximumConsecutiveProfitAmount: number | null;
    averageConsecutiveWins: number | null;
    averageConsecutiveLosses: number | null;
  };
  bySymbol: Array<{
    symbol: string;
    trades: number;
    netProfit: number;
    winRate: number;
  }>;
  bySide: Array<{
    side: string;
    trades: number;
    netProfit: number;
    winRate: number;
  }>;
  outcomeSeries: ChartPoint[];
}
