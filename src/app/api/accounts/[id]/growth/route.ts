import { NextRequest, NextResponse } from "next/server";

import {
  computeAbsoluteGain,
  computeAllTimeGrowth,
  computeCompoundedGrowth,
  computeYearGrowth,
  getAccountBundle,
  getSinceDate,
  parseTimeframe,
  serializeAccountBundle,
  dealNet,
  isBalanceDeal,
} from "@/lib/trading/account-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const bundle = await getAccountBundle(params.id);
    if (!bundle) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { latestReport } = bundle;
    if (!latestReport) {
      return NextResponse.json({ error: "No report data for this account" }, { status: 404 });
    }

    const timeframe = parseTimeframe(request.nextUrl.searchParams.get("timeframe"));
    const reportTime = latestReport.reportDate ? new Date(latestReport.reportDate) : new Date();
    const since = getSinceDate(timeframe, reportTime);
    const year = reportTime.getFullYear();
    const deals = latestReport.dealLedger;

    const allTimeGrowth = computeAllTimeGrowth(deals);
    const ytdGrowth = computeYearGrowth(deals, year);
    const allTimeAbsoluteGain = computeAbsoluteGain(deals, null);
    const ytdAbsoluteGain = computeAbsoluteGain(
      deals,
      new Date(year, 0, 1, 0, 0, 0, 0),
      new Date(year, 11, 31, 23, 59, 59, 999),
    );

    let periodGrowth = allTimeGrowth;
    let absoluteGain = allTimeAbsoluteGain;
    if (timeframe === "year") {
      periodGrowth = ytdGrowth;
      absoluteGain = ytdAbsoluteGain;
    } else if (timeframe !== "all-time") {
      periodGrowth = computeCompoundedGrowth(deals, since, null);
      absoluteGain = computeAbsoluteGain(deals, since, null);
    }

    const monthly = Array.from({ length: 12 }, (_, index) => {
      const start = new Date(year, index, 1, 0, 0, 0, 0);
      const end = new Date(year, index + 1, 0, 23, 59, 59, 999);

      return {
        month: start.toLocaleString("en-US", { month: "short" }),
        value: computeCompoundedGrowth(deals, start, end),
      };
    });

    const years = deals.map((deal) => new Date(deal.time).getFullYear());
    const firstYear = years.length ? Math.min(...years) : year;
    const rangeStart = Math.max(firstYear, year - 4);
    const yearly = Array.from({ length: year - rangeStart + 1 }, (_, index) => {
      const itemYear = rangeStart + index;
      return {
        year: itemYear,
        value:
          itemYear === year
            ? computeYearGrowth(deals, itemYear)
            : computeCompoundedGrowth(
                deals,
                new Date(itemYear, 0, 1, 0, 0, 0, 0),
                new Date(itemYear, 11, 31, 23, 59, 59, 999),
              ),
      };
    });

    const balanceOperations = deals
      .filter((deal) => isBalanceDeal(deal.type))
      .map((deal) => ({
        time: new Date(deal.time).toISOString(),
        type: deal.type,
        delta: dealNet(deal),
      }));

    const account = serializeAccountBundle(bundle);
    if (!account) {
      return NextResponse.json({ error: "Failed to serialize account" }, { status: 500 });
    }

    return NextResponse.json({
      timeframe,
      account,
      summary: {
        periodGrowth,
        ytdGrowth,
        allTimeGrowth,
        absoluteGain,
      },
      series: {
        monthly,
        yearly,
      },
      balanceOperations,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch growth detail" }, { status: 500 });
  }
}
