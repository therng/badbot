import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type EconomicEvent = {
  id: string;
  name: string;
  currency: string;
  impact: "High" | "Medium" | "Low" | "Holiday";
  time: string;       // HH:MM Bangkok time, or "" for all-day
  forecast: string | null;
  previous: string | null;
  actual: string | null;
};

type EconomicEventsResponse = {
  events: EconomicEvent[];
  date: string;
};

// Forex Factory public calendar JSON
// { title, country, date (ISO with tz offset), impact, forecast, previous }
type FFEvent = {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
  actual?: string;
};

function bangkokDateString(now = new Date()): string {
  const bkMs = now.getTime() + 7 * 60 * 60 * 1000;
  return new Date(bkMs).toISOString().split("T")[0];
}

function utcToBangkokHHMM(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return "";
    const bkMs = d.getTime() + 7 * 60 * 60 * 1000;
    const bk = new Date(bkMs);
    const hh = String(bk.getUTCHours()).padStart(2, "0");
    const mm = String(bk.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

function bangkokDateFromISO(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return "";
    const bkMs = d.getTime() + 7 * 60 * 60 * 1000;
    return new Date(bkMs).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

export async function GET(): Promise<NextResponse<EconomicEventsResponse>> {
  const todayBKK = bangkokDateString();

  try {
    const response = await fetch(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Analytic/1.0)",
        },
        next: { revalidate: 300 },
      },
    );

    if (!response.ok) {
      return NextResponse.json({ events: [], date: todayBKK });
    }

    const raw = (await response.json()) as FFEvent[] | null;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ events: [], date: todayBKK });
    }

    const events: EconomicEvent[] = raw
      .filter((ev) => {
        if (!ev.date || !ev.country) return false;
        const currency = ev.country.toUpperCase();
        if (currency !== "USD") return false;
        const impact = ev.impact ?? "";
        if (impact !== "High" && impact !== "Holiday") return false;
        // Only today in Bangkok time
        const evDateBKK = bangkokDateFromISO(ev.date);
        return evDateBKK === todayBKK;
      })
      .map((ev, i) => ({
        id: `${ev.country}-${i}-${ev.date ?? ""}`,
        name: ev.title ?? "Unknown Event",
        currency: (ev.country ?? "USD").toUpperCase(),
        impact: (ev.impact === "Holiday" ? "Holiday" : "High") as EconomicEvent["impact"],
        time: ev.impact === "Holiday" ? "" : utcToBangkokHHMM(ev.date ?? ""),
        forecast: ev.forecast || null,
        previous: ev.previous || null,
        actual: ev.actual || null,
      }))
      .sort((a, b) => {
        if (a.impact === "Holiday" && b.impact !== "Holiday") return 1;
        if (a.impact !== "Holiday" && b.impact === "Holiday") return -1;
        return (a.time ?? "").localeCompare(b.time ?? "");
      });

    return NextResponse.json({ events, date: todayBKK });
  } catch {
    return NextResponse.json({ events: [], date: todayBKK });
  }
}
