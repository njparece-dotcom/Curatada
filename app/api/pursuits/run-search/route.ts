/**
 * POST /api/pursuits/run-search
 *
 * Triggers the pursuit search agent. Called by the daily scheduler.
 *
 * Body (all optional):
 *   { pursuit_type?: "guitar"|"watch"|"auto"|"iod", pursuit_id?: string }
 *
 * If both omitted: runs all active pursuits across all collections.
 * Returns a summary of results.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { GuitarPursuit, WatchPursuit, AutoPursuit, IoDPursuit } from "@/lib/types";
import {
  runGuitarPursuitSearch,
  runWatchPursuitSearch,
  runAutoPursuitSearch,
  runIoDPursuitSearch,
} from "@/lib/pursuit-search";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — searches can take time

export async function POST(req: NextRequest) {
  try {
    // Two callers: signed-in browser users (session-scoped) and the cron container,
    // which authenticates with `Authorization: Bearer ${CRON_SECRET}` and runs all users.
    // The route is excluded from NextAuth middleware so cron can reach it without a JWT.
    const session = await getServerSession(authOptions);
    const cronSecret = process.env.CRON_SECRET;
    const isCron =
      !!cronSecret &&
      req.headers.get("authorization") === `Bearer ${cronSecret}`;
    if (!session?.user?.id && !isCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session?.user?.id ?? null;

    const body = await req.json().catch(() => ({}));
    const { pursuit_type, pursuit_id } = body as {
      pursuit_type?: "guitar" | "watch" | "auto" | "iod";
      pursuit_id?: string;
    };

    const results: { id: string; type: string; found: number; error?: string }[] = [];

    // ── Guitar pursuits ───────────────────────────────────────────────────────
    if (!pursuit_type || pursuit_type === "guitar") {
      const conditions = ["status = $1"];
      const params: unknown[] = ["active"];
      if (pursuit_id) { conditions.push(`id = $${params.length + 1}`); params.push(pursuit_id); }
      if (userId)     { conditions.push(`user_id = $${params.length + 1}`); params.push(userId); }

      const guitars = await query<GuitarPursuit>(
        `SELECT * FROM guitar_pursuits WHERE ${conditions.join(" AND ")} ORDER BY created_at`,
        params,
      );

      for (const pursuit of guitars) {
        try {
          const found = await runGuitarPursuitSearch(pursuit);
          results.push({ id: pursuit.id, type: "guitar", found });
        } catch (err) {
          console.error(`Guitar pursuit ${pursuit.id} search failed:`, err);
          results.push({ id: pursuit.id, type: "guitar", found: 0, error: String(err) });
        }
      }
    }

    // ── Watch pursuits ────────────────────────────────────────────────────────
    if (!pursuit_type || pursuit_type === "watch") {
      const conditions = ["status = $1"];
      const params: unknown[] = ["active"];
      if (pursuit_id) { conditions.push(`id = $${params.length + 1}`); params.push(pursuit_id); }
      if (userId)     { conditions.push(`user_id = $${params.length + 1}`); params.push(userId); }

      const watches = await query<WatchPursuit>(
        `SELECT * FROM watch_pursuits WHERE ${conditions.join(" AND ")} ORDER BY created_at`,
        params,
      );

      for (const pursuit of watches) {
        try {
          const found = await runWatchPursuitSearch(pursuit);
          results.push({ id: pursuit.id, type: "watch", found });
        } catch (err) {
          console.error(`Watch pursuit ${pursuit.id} search failed:`, err);
          results.push({ id: pursuit.id, type: "watch", found: 0, error: String(err) });
        }
      }
    }

    // ── Auto pursuits ─────────────────────────────────────────────────────────
    if (!pursuit_type || pursuit_type === "auto") {
      const conditions = ["status = $1"];
      const params: unknown[] = ["active"];
      if (pursuit_id) { conditions.push(`id = $${params.length + 1}`); params.push(pursuit_id); }
      if (userId)     { conditions.push(`user_id = $${params.length + 1}`); params.push(userId); }

      const autos = await query<AutoPursuit>(
        `SELECT * FROM auto_pursuits WHERE ${conditions.join(" AND ")} ORDER BY created_at`,
        params,
      );

      for (const pursuit of autos) {
        try {
          const found = await runAutoPursuitSearch(pursuit);
          results.push({ id: pursuit.id, type: "auto", found });
        } catch (err) {
          console.error(`Auto pursuit ${pursuit.id} search failed:`, err);
          results.push({ id: pursuit.id, type: "auto", found: 0, error: String(err) });
        }
      }
    }

    // ── IoD pursuits ──────────────────────────────────────────────────────────
    if (!pursuit_type || pursuit_type === "iod") {
      const conditions = ["status = $1"];
      const params: unknown[] = ["active"];
      if (pursuit_id) { conditions.push(`id = $${params.length + 1}`); params.push(pursuit_id); }
      if (userId)     { conditions.push(`user_id = $${params.length + 1}`); params.push(userId); }

      const iods = await query<IoDPursuit>(
        `SELECT * FROM iod_pursuits WHERE ${conditions.join(" AND ")} ORDER BY created_at`,
        params,
      );

      for (const pursuit of iods) {
        try {
          const found = await runIoDPursuitSearch(pursuit);
          results.push({ id: pursuit.id, type: "iod", found });
        } catch (err) {
          console.error(`IoD pursuit ${pursuit.id} search failed:`, err);
          results.push({ id: pursuit.id, type: "iod", found: 0, error: String(err) });
        }
      }
    }

    return NextResponse.json({
      ran_at:  new Date().toISOString(),
      results,
      total_found: results.reduce((s, r) => s + r.found, 0),
    });
  } catch (err) {
    console.error("POST /api/pursuits/run-search error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
