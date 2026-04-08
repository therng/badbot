import { NextRequest, NextResponse } from "next/server";

import { withCachedAccountView } from "@/app/api/accounts/[id]/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return withCachedAccountView(request, params.id, "profitDetail", "Failed to fetch account profit details", (payload) =>
    NextResponse.json(payload),
  );
}
