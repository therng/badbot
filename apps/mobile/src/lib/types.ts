export type Timeframe = "1d" | "5d" | "1m" | "3m" | "6m" | "1y" | "all";

export interface SerializedAccount {
  id: string;
  account_number: string;
  owner_name: string | null;
  currency: string;
  server: string;
  status: "Active" | "Inactive";
  last_updated: string | null;
  balance: number;
  equity: number;
  floating_pl: number;
  margin_level: number | null;
}

export interface BalanceEventPoint {
  x: string;
  y: number;
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
