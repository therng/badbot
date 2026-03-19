import { NextResponse } from "next/server";

import { getAccountListItems } from "@/lib/trading/account-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await getAccountListItems();
    const response = NextResponse.json(accounts);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return response;
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
