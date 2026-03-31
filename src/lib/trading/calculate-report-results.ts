import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeSharpeRatio, summarizeClosedPositions } from "@/lib/trading/analytics";

type NumericLike = number | Prisma.Decimal | null | undefined;

type PositionLike = {
  closeTime?: Date | string | null;
  type?: string | null;
  profit?: NumericLike;
};

type DealLike = {
  time: Date | string;
  profit?: NumericLike;
  commission?: NumericLike;
  swap?: NumericLike;
  balance?: NumericLike;
};

const prismaClient = prisma as any;

function toNumber(value: NumericLike) {
  const numeric = Number(value ?? Number.NaN);
  return Number.isFinite(numeric) ? numeric : null;
}

function toDecimalOrNull(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return new Prisma.Decimal(value);
}

function compareTimes(left: Date | string, right: Date | string) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function sumNumbers(values: Array<number | null>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function calculateBalanceDrawdownMetrics(deals: DealLike[]) {
  const orderedBalances = [...deals]
    .sort((left, right) => compareTimes(left.time, right.time))
    .map((deal) => ({
      time: deal.time,
      balance: toNumber(deal.balance),
    }))
    .filter((deal): deal is { time: Date | string; balance: number } => deal.balance !== null);

  if (orderedBalances.length < 2) {
    return {
      balanceDrawdownAbsolute: null,
      balanceDrawdownMaximal: null,
      balanceDrawdownMaximalPct: null,
      balanceDrawdownRelativePct: null,
      balanceDrawdownRelative: null,
    };
  }

  const firstBalance = orderedBalances[0]?.balance ?? null;
  if (!Number.isFinite(firstBalance)) {
    return {
      balanceDrawdownAbsolute: null,
      balanceDrawdownMaximal: null,
      balanceDrawdownMaximalPct: null,
      balanceDrawdownRelativePct: null,
      balanceDrawdownRelative: null,
    };
  }

  let minimumBalance = firstBalance;
  let runningPeak = firstBalance;
  let maximalAmount = 0;
  let maximalPctAtAmount = 0;
  let relativeAmount = 0;
  let relativePct = 0;

  for (const point of orderedBalances) {
    minimumBalance = Math.min(minimumBalance, point.balance);
    runningPeak = Math.max(runningPeak, point.balance);

    const amount = runningPeak - point.balance;
    const pct = runningPeak > 0 ? (amount / runningPeak) * 100 : 0;

    if (amount > maximalAmount) {
      maximalAmount = amount;
      maximalPctAtAmount = pct;
    }

    if (pct > relativePct) {
      relativePct = pct;
      relativeAmount = amount;
    }
  }

  const absolute = Math.max(0, firstBalance - minimumBalance);

  return {
    balanceDrawdownAbsolute: absolute > 0 ? absolute : 0,
    balanceDrawdownMaximal: maximalAmount > 0 ? maximalAmount : 0,
    balanceDrawdownMaximalPct: maximalAmount > 0 ? maximalPctAtAmount : 0,
    balanceDrawdownRelativePct: relativePct > 0 ? relativePct : 0,
    balanceDrawdownRelative: relativeAmount > 0 ? relativeAmount : 0,
  };
}

export function calculateReportResults(params: {
  positions: PositionLike[];
  deals: DealLike[];
}) {
  const { positions, deals } = params;
  const positionSummary = summarizeClosedPositions(positions);
  const totalCommission = sumNumbers(deals.map((deal) => toNumber(deal.commission)));
  const totalSwap = sumNumbers(deals.map((deal) => toNumber(deal.swap)));
  const drawdown = calculateBalanceDrawdownMetrics(deals);
  const sharpeRatio = computeSharpeRatio(
    positions
      .map((position) => toNumber(position.profit))
      .filter((value): value is number => value !== null),
  );

  return {
    totalCommission: toDecimalOrNull(totalCommission),
    totalSwap: toDecimalOrNull(totalSwap),
    totalNetProfit: toDecimalOrNull(positionSummary.totalNetProfit),
    grossProfit: toDecimalOrNull(positionSummary.grossProfit),
    grossLoss: toDecimalOrNull(positionSummary.grossLoss),
    profitFactor: positionSummary.profitFactor,
    expectedPayoff: toDecimalOrNull(positionSummary.expectedPayoff),
    recoveryFactor:
      Number(drawdown.balanceDrawdownMaximal ?? 0) > 0
        ? positionSummary.totalNetProfit / Number(drawdown.balanceDrawdownMaximal)
        : null,
    sharpeRatio,
    balanceDrawdownAbsolute: toDecimalOrNull(drawdown.balanceDrawdownAbsolute),
    balanceDrawdownMaximal: toDecimalOrNull(drawdown.balanceDrawdownMaximal),
    balanceDrawdownMaximalPct: drawdown.balanceDrawdownMaximalPct,
    balanceDrawdownRelativePct: drawdown.balanceDrawdownRelativePct,
    balanceDrawdownRelative: toDecimalOrNull(drawdown.balanceDrawdownRelative),
    totalTrades: positionSummary.totalTrades,
    shortTradesWon: positionSummary.shortTradesWon,
    shortTradesTotal: positionSummary.shortTradesTotal,
    longTradesWon: positionSummary.longTradesWon,
    longTradesTotal: positionSummary.longTradesTotal,
    profitTradesCount: positionSummary.profitTradesCount,
    lossTradesCount: positionSummary.lossTradesCount,
    largestProfitTrade: toDecimalOrNull(positionSummary.largestProfitTrade),
    largestLossTrade: toDecimalOrNull(positionSummary.largestLossTrade),
    averageProfitTrade: toDecimalOrNull(positionSummary.averageProfitTrade),
    averageLossTrade: toDecimalOrNull(positionSummary.averageLossTrade),
    maximumConsecutiveWins: positionSummary.maximumConsecutiveWins,
    maximumConsecutiveLosses: positionSummary.maximumConsecutiveLosses,
  };
}

export async function recomputeAccountReportResult(accountId: string, sourceReportDate?: Date | null) {
  const [positions, deals] = await Promise.all([
    prismaClient.position.findMany({
      where: { tradingAccountId: accountId },
      select: {
        closeTime: true,
        type: true,
        profit: true,
      },
      orderBy: [{ closeTime: "asc" }, { positionNo: "asc" }],
    }),
    prismaClient.deal.findMany({
      where: { tradingAccountId: accountId },
      select: {
        time: true,
        profit: true,
        commission: true,
        swap: true,
        balance: true,
      },
      orderBy: [{ time: "asc" }, { dealNo: "asc" }],
    }),
  ]);

  const result = calculateReportResults({ positions, deals });

  await prismaClient.accountReportResult.upsert({
    where: { tradingAccountId: accountId },
    update: {
      ...result,
      computedAt: new Date(),
      sourceReportDate: sourceReportDate ?? null,
    },
    create: {
      tradingAccountId: accountId,
      sourceReportDate: sourceReportDate ?? null,
      ...result,
    },
  });

  return result;
}
