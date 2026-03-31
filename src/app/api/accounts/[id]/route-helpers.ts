import { NextRequest, NextResponse } from "next/server";

import {
  getCachedAccountView,
  parseRequestTimeframe,
  type AccountCachedViewKind,
} from "@/lib/trading/preaggregated-cache";

type RouteHandler = () => Promise<NextResponse> | NextResponse;

export function jsonApiError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function withApiErrorHandling(errorMessage: string, handler: RouteHandler) {
  try {
    return await handler();
  } catch (error) {
    console.error("API Error:", error);
    return jsonApiError(errorMessage, 500);
  }
}

export async function withCachedAccountView(
  request: NextRequest,
  accountId: string,
  viewKind: AccountCachedViewKind,
  errorMessage: string,
  handler: (payload: unknown) => Promise<NextResponse> | NextResponse,
) {
  return withApiErrorHandling(errorMessage, async () => {
    const timeframe = parseRequestTimeframe(request.nextUrl.searchParams.get("timeframe"));
    const payload = await getCachedAccountView(accountId, timeframe, viewKind);

    if (!payload) {
      return jsonApiError("Account not found", 404);
    }

    return handler(payload);
  });
}
