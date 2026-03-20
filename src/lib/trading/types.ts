export type Timeframe = "day" | "week" | "month" | "year" | "all-time";

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

export interface EquityEventPoint extends ChartPoint {
  balance: number;
  equity: number;
  eventType: string | null;
  eventDelta: number | null;
}

export interface AccountOverviewResponse {
  timeframe: Timeframe;
  account: SerializedAccount;
  kpis: {
    netProfit: number;
    drawdown: number;
    winPercent: number;
    trades: number;
    floatingPL: number;
    openCount: number;
  };
  equityCurve: ChartPoint[];
}

export interface EquityDetailResponse {
  timeframe: Timeframe;
  account: SerializedAccount;
  summary: {
    absoluteDrawdown: number | null;
    relativeDrawdownPct: number | null;
    maximalDrawdownAmount: number | null;
    maximalDrawdownPct: number | null;
    maximalDepositLoad: number | null;
  };
  equityCurve: EquityEventPoint[];
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
    tradesPerWeek: number | null;
    longTradeWin: number | null;
    shortTradeWin: number | null;
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
    sharpeRatio: number | null;
    profitFactor: number | null;
    recoveryFactor: number | null;
    expectedPayoff: number | null;
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

export interface ReportDetailResponse {
  account: SerializedAccount;
  report: {
    fileName: string;
    reportTimestamp: Date;
  };
  summary: {
    balance: number;
    equity: number;
    floatingProfit: number;
    margin: number;
    freeMargin: number;
    marginLevel: number | null;
    openCount: number;
    workingCount: number;
    resultCount: number;
    openVolume: number;
    resultVolume: number;
    grossProfit: number;
    grossLoss: number;
    netProfit: number;
    commissionTotal: number;
    swapTotal: number;
    winRate: number;
    bestTrade: number | null;
    worstTrade: number | null;
  };
  balanceDrawdown: {
    amount: number;
    percent: number;
    peakBalance: number;
    troughBalance: number;
  };
  tradeStats: {
    totalTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number;
    lossRate: number;
    totalVolume: number;
    averageVolume: number;
    avgTradeNet: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number | null;
    expectancy: number;
    bestTrade: number | null;
    worstTrade: number | null;
    bestWinStreak: number;
    worstLossStreak: number;
    longTrades: number;
    shortTrades: number;
    longWinRate: number;
    shortWinRate: number;
  };
  equityCurve: EquityEventPoint[];
  balanceOperations: Array<{
    time: Date;
    type: string | null;
    delta: number;
    balanceAfter: number;
  }>;
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
  results: Array<{
    dealId: string;
    symbol: string;
    side: string;
    volume: number;
    time: Date;
    price: number | null;
    profit: number;
    swap: number;
    commission: number;
    net: number;
    comment: string | null;
  }>;
}
