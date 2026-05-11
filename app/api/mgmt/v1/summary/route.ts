// GET /api/mgmt/v1/summary
//
// Headline counts for the central dashboard. See lib/mgmt/data.ts for the
// "active 30d" definition (logged in 30d AND has an item updated in 30d).

import { NextRequest } from "next/server";
import { authorizeMgmtRequest } from "@/lib/mgmt/auth";
import { envelopeResponse, errorResponse } from "@/lib/mgmt/envelope";
import { getMgmtSummary } from "@/lib/mgmt/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = authorizeMgmtRequest(request);
  if (guard instanceof Response) return guard;

  try {
    const summary = await getMgmtSummary();
    return envelopeResponse(summary);
  } catch (err) {
    // Never leak DB error text — the dashboard logs the 500 and we keep
    // schema/stack out of the response. Detailed traces go to the app logs.
    console.error("[mgmt/summary]", err);
    return errorResponse("Internal error", 500);
  }
}
