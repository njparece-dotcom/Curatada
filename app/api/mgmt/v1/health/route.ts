// GET /api/mgmt/v1/health
//
// Liveness for the central dashboard: confirms the DB is reachable and
// reports the latest run of each long-running background job. Per the
// playbook contract — naming follows the cron job's id so the dashboard
// can render scheduler timestamps generically.

import { NextRequest } from "next/server";
import { authorizeMgmtRequest } from "@/lib/mgmt/auth";
import { envelopeResponse } from "@/lib/mgmt/envelope";
import { pingDb, getLastPursuitSearchRun } from "@/lib/mgmt/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = authorizeMgmtRequest(request);
  if (guard instanceof Response) return guard;

  const [dbOk, lastRun] = await Promise.all([
    pingDb(),
    getLastPursuitSearchRun(),
  ]);

  return envelopeResponse({
    ok: dbOk,
    db: dbOk ? "ok" : "error",
    scheduler_last_pursuit_search_run: lastRun,
  });
}
