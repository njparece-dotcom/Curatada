// GET /api/admin/moderation/queue
//
// Cross-module moderation review queue. Returns image rows across all four
// modules (guitars, watches, automobiles, iod) filtered by moderation_status
// and minimum NSFW score, ordered by created_at DESC.
//
// Query params:
//   - statuses: comma-separated list of moderation_status values.
//       Default: "flagged,unreviewed". Invalid values are dropped.
//   - min_score: minimum nsfw_score (0..1, default 0). Useful for narrowing
//       the queue to the most-suspect images during high-volume reviews.
//   - limit:  page size (default 50, max 200)
//   - offset: pagination offset (default 0)
//
// Auth: admin-only via `lib/admin.ts` isAdmin(session) — reads the
// `ADMIN_EMAILS` env var allowlist. Non-admin authed users get 403; the
// existence of the route is intentionally not hidden (404) so a misconfigured
// allowlist surfaces a clear error.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { query } from "@/lib/db";
import { buildQueueSql, parseStatuses } from "@/lib/moderation/queue";

interface QueueRow {
  module: "guitars" | "watches" | "automobiles" | "iod";
  image_id: string;
  item_id: string;
  filename: string;
  path: string;
  mime_type: string | null;
  is_primary: boolean;
  moderation_status: string;
  nsfw_score: string | null; // pg returns NUMERIC as string
  nsfw_categories: { className: string; probability: number }[] | null;
  created_at: string;
  item_label: string | null;
  user_id: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const statuses = parseStatuses(url.searchParams.get("statuses"));

    const minScoreRaw = parseFloat(url.searchParams.get("min_score") || "0");
    const minScore = Number.isFinite(minScoreRaw)
      ? Math.min(Math.max(minScoreRaw, 0), 1)
      : 0;

    const limitRaw = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50;

    const offsetRaw = parseInt(url.searchParams.get("offset") || "0", 10);
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const sql = buildQueueSql();
    const rows = await query<QueueRow>(sql, [statuses, minScore, limit, offset]);

    // Normalise nsfw_score → number for the client. pg's NUMERIC arrives as
    // a string; the slider/colour math wants a Number.
    const normalised = rows.map((r) => ({
      ...r,
      nsfw_score: r.nsfw_score == null ? null : Number(r.nsfw_score),
    }));

    return NextResponse.json({
      items: normalised,
      paging: {
        limit,
        offset,
        // We don't return total because the UNION COUNT would be expensive
        // and the queue is read-and-act, not paginate-randomly. The client
        // shows "Load more" when items.length === limit.
        has_more: rows.length === limit,
      },
      filters: { statuses, min_score: minScore },
    });
  } catch (error) {
    console.error("GET /api/admin/moderation/queue error:", error);
    return NextResponse.json(
      { error: "Failed to load moderation queue" },
      { status: 500 },
    );
  }
}
