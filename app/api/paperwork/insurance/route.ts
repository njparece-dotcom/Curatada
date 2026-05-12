// GET /api/paperwork/insurance — aggregate insurance schedule across all 4
// collection modules for the current user. Story CUR-7 of the Insurance
// Validation and Paperwork Epic (CUR-1).
//
// Filters to `user_id = session.user.id AND insure = TRUE AND archived_at IS
// NULL`. Items without an insurance_value are included with
// `needs_valuation: true` so the schedule view can surface a "run a value"
// prompt rather than silently dropping them.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type ModuleSlug = "guitars" | "watches" | "automobiles" | "iod";
type InsuranceSource = "ai" | "alternate_from_user" | "user_override";

interface ScheduleItem {
  id: string;
  module: ModuleSlug;
  category: string;
  year: number | null;
  brand: string | null;
  model: string | null;
  description: string | null;
  condition: string | null;
  serial: string | null;
  insurance_value: number | null;
  insurance_value_source: InsuranceSource | null;
  insurance_value_date: string | null;
  primary_image_path: string | null;
  needs_valuation: boolean;
}

interface ModuleSummary {
  count: number;
  total: number;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // UNION ALL across the 4 item tables. Each branch projects to the same
    // column shape so we can ORDER by them at the top level. Insurance-
    // schedule queries are powered by the partial indexes added in CUR-2
    // (idx_{module}_insure_active).
    const rows = await query<ScheduleItem>(
      `
      SELECT * FROM (
        SELECT
          gi.id,
          'guitars'::text                                AS module,
          gi.category::text                              AS category,
          gi.year,
          gi.brand,
          gi.model,
          NULLIF(TRIM(COALESCE(gi.short_description, '') || CASE WHEN gi.color_finish IS NOT NULL AND gi.color_finish <> '' THEN ' · ' || gi.color_finish ELSE '' END), '') AS description,
          gi.condition::text                             AS condition,
          gi.serial_number                               AS serial,
          gi.insurance_value::float                      AS insurance_value,
          gi.insurance_value_source                      AS insurance_value_source,
          gi.insurance_value_date,
          (
            SELECT img.path FROM guitar_images img
            WHERE img.guitar_item_id = gi.id
            ORDER BY img.is_primary DESC, img.sort_order ASC, img.created_at ASC
            LIMIT 1
          )                                              AS primary_image_path,
          (gi.insurance_value IS NULL)                   AS needs_valuation
        FROM guitar_items gi
        WHERE gi.user_id = $1 AND gi.insure = TRUE AND gi.archived_at IS NULL

        UNION ALL

        SELECT
          wi.id,
          'watches'::text                                AS module,
          wi.category::text                              AS category,
          wi.year,
          wi.brand,
          wi.model,
          NULLIF(TRIM(COALESCE(wi.short_description, '') || CASE WHEN wi.dial_color IS NOT NULL AND wi.dial_color <> '' THEN ' · ' || wi.dial_color ELSE '' END), '') AS description,
          wi.condition::text                             AS condition,
          wi.serial_number                               AS serial,
          wi.insurance_value::float                      AS insurance_value,
          wi.insurance_value_source                      AS insurance_value_source,
          wi.insurance_value_date,
          (
            SELECT img.path FROM watch_images img
            WHERE img.watch_item_id = wi.id
            ORDER BY img.is_primary DESC, img.sort_order ASC, img.created_at ASC
            LIMIT 1
          )                                              AS primary_image_path,
          (wi.insurance_value IS NULL)                   AS needs_valuation
        FROM watch_items wi
        WHERE wi.user_id = $1 AND wi.insure = TRUE AND wi.archived_at IS NULL

        UNION ALL

        SELECT
          a.id,
          'automobiles'::text                            AS module,
          a.category::text                               AS category,
          a.year,
          a.brand,
          a.model,
          NULLIF(TRIM(COALESCE(a.description, '') || CASE WHEN a.color IS NOT NULL AND a.color <> '' THEN ' · ' || a.color ELSE '' END), '') AS description,
          COALESCE(a.condition, '')::text                AS condition,
          a.vin                                          AS serial,
          a.insurance_value::float                       AS insurance_value,
          a.insurance_value_source                       AS insurance_value_source,
          a.insurance_value_date,
          (
            SELECT img.path FROM auto_images img
            WHERE img.auto_id = a.id
            ORDER BY img.is_primary DESC, img.sort_order ASC, img.created_at ASC
            LIMIT 1
          )                                              AS primary_image_path,
          (a.insurance_value IS NULL)                    AS needs_valuation
        FROM automobiles a
        WHERE a.user_id = $1 AND a.insure = TRUE AND a.archived_at IS NULL

        UNION ALL

        SELECT
          i.id,
          'iod'::text                                    AS module,
          i.category::text                               AS category,
          i.year,
          COALESCE(i.brand, i.item_type)                 AS brand,
          i.short_description                            AS model,
          i.long_description                             AS description,
          COALESCE(i.condition, '')::text                AS condition,
          NULL::text                                     AS serial,
          i.insurance_value::float                       AS insurance_value,
          i.insurance_value_source                       AS insurance_value_source,
          i.insurance_value_date,
          (
            SELECT img.path FROM iod_images img
            WHERE img.iod_id = i.id
            ORDER BY img.is_primary DESC, img.sort_order ASC, img.created_at ASC
            LIMIT 1
          )                                              AS primary_image_path,
          (i.insurance_value IS NULL)                    AS needs_valuation
        FROM items_of_distinction i
        WHERE i.user_id = $1 AND i.insure = TRUE AND i.archived_at IS NULL
      ) combined
      ORDER BY module, category, brand NULLS LAST, model NULLS LAST
      `,
      [userId],
    );

    const summary: { item_count: number; total_insured_value: number; by_module: Record<ModuleSlug, ModuleSummary> } = {
      item_count: rows.length,
      total_insured_value: 0,
      by_module: {
        guitars: { count: 0, total: 0 },
        watches: { count: 0, total: 0 },
        automobiles: { count: 0, total: 0 },
        iod: { count: 0, total: 0 },
      },
    };

    for (const r of rows) {
      const v = r.insurance_value == null ? 0 : Number(r.insurance_value);
      summary.total_insured_value += v;
      const bucket = summary.by_module[r.module as ModuleSlug];
      if (bucket) {
        bucket.count += 1;
        bucket.total += v;
      }
    }

    return NextResponse.json({
      user: { name: session.user.name ?? null, email: session.user.email ?? null },
      generated_at: new Date().toISOString(),
      items: rows,
      summary,
    });
  } catch (error) {
    console.error("GET /api/paperwork/insurance error:", error);
    return NextResponse.json(
      { error: "Failed to load insurance schedule" },
      { status: 500 },
    );
  }
}
