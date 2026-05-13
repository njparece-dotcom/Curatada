import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { query } from "@/lib/db";

// Allowed period configs — never interpolate user input directly
const PERIOD_CONFIG: Record<string, { start: string; step: string }> = {
  "1M":  { start: "CURRENT_DATE - INTERVAL '30 days'",  step: "'1 day'" },
  "3M":  { start: "CURRENT_DATE - INTERVAL '90 days'",  step: "'3 days'" },
  "6M":  { start: "CURRENT_DATE - INTERVAL '180 days'", step: "'7 days'" },
  "1Y":  { start: "CURRENT_DATE - INTERVAL '1 year'",   step: "'7 days'" },
  "ALL": { start: "CURRENT_DATE - INTERVAL '3 years'",  step: "'1 month'" },
};

/** Pick the best period based on how old the earliest valuation is for this user. */
async function resolveAutoPeriod(userId: string): Promise<string> {
  const rows = await query<{ earliest: string | null }>(`
    SELECT MIN(v.created_at)::text AS earliest
    FROM (
      SELECT gv.created_at FROM guitar_valuations gv
        JOIN guitar_items gi ON gi.id = gv.guitar_item_id AND gi.user_id = $1
      UNION ALL
      SELECT wv.created_at FROM watch_valuations wv
        JOIN watch_items wi ON wi.id = wv.watch_item_id AND wi.user_id = $1
      UNION ALL
      SELECT av.created_at FROM auto_valuations av
        JOIN automobiles a ON a.id = av.auto_id AND a.user_id = $1
      UNION ALL
      SELECT iv.created_at FROM iod_valuations iv
        JOIN items_of_distinction i ON i.id = iv.iod_id AND i.user_id = $1
    ) v
  `, [userId]);

  const earliest = rows[0]?.earliest;
  if (!earliest) return "1M";

  const ageDays = (Date.now() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 30)  return "1M";
  if (ageDays < 90)  return "3M";
  if (ageDays < 180) return "6M";
  return "1Y";
}

export async function GET(request: Request) {
  const session = await getApiSession(request);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const rawPeriod = (searchParams.get("period") ?? "AUTO").toUpperCase();

  try {
    const resolvedPeriod = rawPeriod === "AUTO"
      ? await resolveAutoPeriod(userId)
      : rawPeriod;

    const cfg = PERIOD_CONFIG[resolvedPeriod] ?? PERIOD_CONFIG["1Y"];

    const rows = await query<{
      date: string;
      guitar: number;
      watch: number;
      auto: number;
      iod: number;
      total: number;
      cost: number;
      guitar_cost: number;
      watch_cost: number;
      auto_cost: number;
      iod_cost: number;
      guitar_count: number;
      watch_count: number;
      auto_count: number;
      iod_count: number;
    }>(`
      WITH date_series AS (
        SELECT generate_series(
          ${cfg.start},
          CURRENT_DATE,
          ${cfg.step}::interval
        )::date AS snapshot_date
      ),

      -- Latest guitar valuation per item per snapshot (user-scoped)
      latest_guitar AS (
        SELECT DISTINCT ON (gv.guitar_item_id, ds.snapshot_date)
          ds.snapshot_date,
          gv.price
        FROM date_series ds
        JOIN guitar_valuations gv ON gv.created_at::date <= ds.snapshot_date
        JOIN guitar_items gi ON gi.id = gv.guitar_item_id AND gi.user_id = $1
        ORDER BY gv.guitar_item_id, ds.snapshot_date, gv.created_at DESC
      ),
      guitar_totals AS (
        SELECT snapshot_date, SUM(price)::numeric AS guitar_value
        FROM latest_guitar GROUP BY snapshot_date
      ),

      -- Latest watch valuation per item per snapshot (user-scoped)
      latest_watch AS (
        SELECT DISTINCT ON (wv.watch_item_id, ds.snapshot_date)
          ds.snapshot_date,
          wv.price
        FROM date_series ds
        JOIN watch_valuations wv ON wv.created_at::date <= ds.snapshot_date
        JOIN watch_items wi ON wi.id = wv.watch_item_id AND wi.user_id = $1
        ORDER BY wv.watch_item_id, ds.snapshot_date, wv.created_at DESC
      ),
      watch_totals AS (
        SELECT snapshot_date, SUM(price)::numeric AS watch_value
        FROM latest_watch GROUP BY snapshot_date
      ),

      -- Latest auto valuation per item per snapshot (user-scoped)
      latest_auto AS (
        SELECT DISTINCT ON (av.auto_id, ds.snapshot_date)
          ds.snapshot_date,
          av.price
        FROM date_series ds
        JOIN auto_valuations av ON av.created_at::date <= ds.snapshot_date
        JOIN automobiles a ON a.id = av.auto_id AND a.user_id = $1
        ORDER BY av.auto_id, ds.snapshot_date, av.created_at DESC
      ),
      auto_totals AS (
        SELECT snapshot_date, SUM(price)::numeric AS auto_value
        FROM latest_auto GROUP BY snapshot_date
      ),

      -- Latest IoD valuation per item per snapshot (user-scoped)
      latest_iod AS (
        SELECT DISTINCT ON (iv.iod_id, ds.snapshot_date)
          ds.snapshot_date,
          iv.price
        FROM date_series ds
        JOIN iod_valuations iv ON iv.created_at::date <= ds.snapshot_date
        JOIN items_of_distinction i ON i.id = iv.iod_id AND i.user_id = $1
        ORDER BY iv.iod_id, ds.snapshot_date, iv.created_at DESC
      ),
      iod_totals AS (
        SELECT snapshot_date, SUM(price)::numeric AS iod_value
        FROM latest_iod GROUP BY snapshot_date
      ),

      -- Cumulative cost basis per snapshot (user-scoped)
      guitar_costs AS (
        SELECT ds.snapshot_date,
          COALESCE(SUM(gi.purchase_price), 0)::numeric AS guitar_cost
        FROM date_series ds
        LEFT JOIN guitar_items gi ON gi.created_at::date <= ds.snapshot_date AND gi.user_id = $1
        GROUP BY ds.snapshot_date
      ),
      watch_costs AS (
        SELECT ds.snapshot_date,
          COALESCE(SUM(wi.purchase_price), 0)::numeric AS watch_cost
        FROM date_series ds
        LEFT JOIN watch_items wi ON wi.created_at::date <= ds.snapshot_date AND wi.user_id = $1
        GROUP BY ds.snapshot_date
      ),
      auto_costs AS (
        SELECT ds.snapshot_date,
          COALESCE(SUM(a.purchase_price), 0)::numeric AS auto_cost
        FROM date_series ds
        LEFT JOIN automobiles a ON a.created_at::date <= ds.snapshot_date AND a.user_id = $1
        GROUP BY ds.snapshot_date
      ),
      iod_costs AS (
        SELECT ds.snapshot_date,
          COALESCE(SUM(i.purchase_price), 0)::numeric AS iod_cost
        FROM date_series ds
        LEFT JOIN items_of_distinction i ON i.created_at::date <= ds.snapshot_date AND i.user_id = $1
        GROUP BY ds.snapshot_date
      ),

      -- Per-module cumulative item count per snapshot (user-scoped). Counts
      -- items whose created_at falls on or before the snapshot date. Items
      -- are hard-deleted so this is monotonically non-decreasing for items
      -- that still exist; deletions just lower the present value across
      -- all past snapshots — acceptable for a "collection growth" view.
      guitar_counts AS (
        SELECT ds.snapshot_date,
          COUNT(gi.id)::int AS guitar_count
        FROM date_series ds
        LEFT JOIN guitar_items gi ON gi.created_at::date <= ds.snapshot_date AND gi.user_id = $1
        GROUP BY ds.snapshot_date
      ),
      watch_counts AS (
        SELECT ds.snapshot_date,
          COUNT(wi.id)::int AS watch_count
        FROM date_series ds
        LEFT JOIN watch_items wi ON wi.created_at::date <= ds.snapshot_date AND wi.user_id = $1
        GROUP BY ds.snapshot_date
      ),
      auto_counts AS (
        SELECT ds.snapshot_date,
          COUNT(a.id)::int AS auto_count
        FROM date_series ds
        LEFT JOIN automobiles a ON a.created_at::date <= ds.snapshot_date AND a.user_id = $1
        GROUP BY ds.snapshot_date
      ),
      iod_counts AS (
        SELECT ds.snapshot_date,
          COUNT(i.id)::int AS iod_count
        FROM date_series ds
        LEFT JOIN items_of_distinction i ON i.created_at::date <= ds.snapshot_date AND i.user_id = $1
        GROUP BY ds.snapshot_date
      )

      SELECT
        ds.snapshot_date::text                      AS date,
        COALESCE(gt.guitar_value, 0)::float         AS guitar,
        COALESCE(wt.watch_value, 0)::float          AS watch,
        COALESCE(at.auto_value, 0)::float           AS auto,
        COALESCE(it.iod_value, 0)::float            AS iod,
        (
          COALESCE(gt.guitar_value, 0) +
          COALESCE(wt.watch_value, 0) +
          COALESCE(at.auto_value, 0) +
          COALESCE(it.iod_value, 0)
        )::float                                    AS total,
        (
          COALESCE(gc.guitar_cost, 0) +
          COALESCE(wc.watch_cost, 0) +
          COALESCE(ac.auto_cost, 0) +
          COALESCE(ic.iod_cost, 0)
        )::float                                    AS cost,
        COALESCE(gc.guitar_cost, 0)::float          AS guitar_cost,
        COALESCE(wc.watch_cost, 0)::float           AS watch_cost,
        COALESCE(ac.auto_cost, 0)::float            AS auto_cost,
        COALESCE(ic.iod_cost, 0)::float             AS iod_cost,
        COALESCE(gn.guitar_count, 0)::int           AS guitar_count,
        COALESCE(wn.watch_count, 0)::int            AS watch_count,
        COALESCE(an.auto_count, 0)::int             AS auto_count,
        COALESCE(inn.iod_count, 0)::int             AS iod_count
      FROM date_series ds
      LEFT JOIN guitar_totals gt ON gt.snapshot_date = ds.snapshot_date
      LEFT JOIN watch_totals  wt ON wt.snapshot_date = ds.snapshot_date
      LEFT JOIN auto_totals   at ON at.snapshot_date = ds.snapshot_date
      LEFT JOIN iod_totals    it ON it.snapshot_date = ds.snapshot_date
      LEFT JOIN guitar_costs  gc ON gc.snapshot_date = ds.snapshot_date
      LEFT JOIN watch_costs   wc ON wc.snapshot_date = ds.snapshot_date
      LEFT JOIN auto_costs    ac ON ac.snapshot_date = ds.snapshot_date
      LEFT JOIN iod_costs     ic ON ic.snapshot_date = ds.snapshot_date
      LEFT JOIN guitar_counts gn ON gn.snapshot_date = ds.snapshot_date
      LEFT JOIN watch_counts  wn ON wn.snapshot_date = ds.snapshot_date
      LEFT JOIN auto_counts   an ON an.snapshot_date = ds.snapshot_date
      LEFT JOIN iod_counts    inn ON inn.snapshot_date = ds.snapshot_date
      ORDER BY ds.snapshot_date
    `, [userId]);

    return NextResponse.json({ points: rows, period: resolvedPeriod });
  } catch (err) {
    console.error("[history]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
