// GET /api/mgmt/v1/users?cursor=&limit=
//
// Cursor-paginated user list for the central dashboard. Stable order by
// (created_at ASC, id ASC) — see lib/mgmt/data.ts. Email is intentionally
// returned in cleartext for support-ticket cross-referencing; the
// dashboard is responsible for not surfacing it to non-admin viewers.

import { NextRequest } from "next/server";
import { authorizeMgmtRequest } from "@/lib/mgmt/auth";
import { envelopeResponse, errorResponse } from "@/lib/mgmt/envelope";
import { listMgmtUsers } from "@/lib/mgmt/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = authorizeMgmtRequest(request);
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : null;

  if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
    return errorResponse("limit must be a positive integer", 400);
  }

  try {
    const result = await listMgmtUsers(cursor, limit);
    return envelopeResponse(result);
  } catch (err) {
    console.error("[mgmt/users]", err);
    return errorResponse("Internal error", 500);
  }
}
