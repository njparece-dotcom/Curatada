// POST /api/paperwork/insurance/export — render the user's insurance
// schedule to a PDF, persist it (R2 in prod, public/uploads/paperwork/ in
// dev), log to paperwork_generations, return a 1-hour presigned URL for the
// client to download. Story CUR-8 of the Insurance Validation and Paperwork
// Epic (CUR-1).

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import {
  r2IsConfigured,
  r2PutObject,
  r2GetPresignedUrl,
} from "@/lib/storage/r2";
import {
  renderInsurancePdf,
  type InsuranceScheduleData,
} from "@/lib/paperwork/insurance-pdf";

export const dynamic = "force-dynamic";

type ModuleSlug = "guitars" | "watches" | "automobiles" | "iod";
type InsuranceSource = "ai" | "alternate_from_user" | "user_override";

interface RawRow {
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
  needs_valuation: boolean;
}

export async function POST() {
  const t0 = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Same UNION query as GET /api/paperwork/insurance — kept inline here
    // rather than importing because the GET route returns a NextResponse
    // wrapper. A future refactor could extract a shared `getInsuranceSchedule
    // (userId)` helper, but the duplication is minimal for now.
    const rows = await query<RawRow>(
      `
      SELECT * FROM (
        SELECT
          gi.id, 'guitars'::text AS module, gi.category::text AS category, gi.year, gi.brand, gi.model,
          NULLIF(TRIM(COALESCE(gi.short_description, '') || CASE WHEN gi.color_finish IS NOT NULL AND gi.color_finish <> '' THEN ' · ' || gi.color_finish ELSE '' END), '') AS description,
          gi.condition::text AS condition, gi.serial_number AS serial,
          gi.insurance_value::float AS insurance_value, gi.insurance_value_source, gi.insurance_value_date,
          (gi.insurance_value IS NULL) AS needs_valuation
        FROM guitar_items gi WHERE gi.user_id = $1 AND gi.insure = TRUE AND gi.archived_at IS NULL

        UNION ALL

        SELECT
          wi.id, 'watches'::text, wi.category::text, wi.year, wi.brand, wi.model,
          NULLIF(TRIM(COALESCE(wi.short_description, '') || CASE WHEN wi.dial_color IS NOT NULL AND wi.dial_color <> '' THEN ' · ' || wi.dial_color ELSE '' END), ''),
          wi.condition::text, wi.serial_number,
          wi.insurance_value::float, wi.insurance_value_source, wi.insurance_value_date,
          (wi.insurance_value IS NULL)
        FROM watch_items wi WHERE wi.user_id = $1 AND wi.insure = TRUE AND wi.archived_at IS NULL

        UNION ALL

        SELECT
          a.id, 'automobiles'::text, a.category::text, a.year, a.brand, a.model,
          NULLIF(TRIM(COALESCE(a.description, '') || CASE WHEN a.color IS NOT NULL AND a.color <> '' THEN ' · ' || a.color ELSE '' END), ''),
          COALESCE(a.condition, '')::text, a.vin,
          a.insurance_value::float, a.insurance_value_source, a.insurance_value_date,
          (a.insurance_value IS NULL)
        FROM automobiles a WHERE a.user_id = $1 AND a.insure = TRUE AND a.archived_at IS NULL

        UNION ALL

        SELECT
          i.id, 'iod'::text, i.category::text, i.year, COALESCE(i.brand, i.item_type) AS brand, i.short_description AS model,
          i.long_description,
          COALESCE(i.condition, '')::text, NULL::text,
          i.insurance_value::float, i.insurance_value_source, i.insurance_value_date,
          (i.insurance_value IS NULL)
        FROM items_of_distinction i WHERE i.user_id = $1 AND i.insure = TRUE AND i.archived_at IS NULL
      ) combined
      ORDER BY module, category, brand NULLS LAST, model NULLS LAST
      `,
      [userId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No items flagged for insurance. Flag at least one item before generating a PDF." },
        { status: 400 },
      );
    }

    // Build summary the same way the GET endpoint does.
    const summary: InsuranceScheduleData["summary"] = {
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
      summary.by_module[r.module].count += 1;
      summary.by_module[r.module].total += v;
    }

    const data: InsuranceScheduleData = {
      user: { name: session.user.name ?? null, email: session.user.email ?? null },
      generated_at: new Date().toISOString(),
      items: rows,
      summary,
    };

    // Render the PDF buffer.
    const pdfBuffer = await renderInsurancePdf(data);

    // Persist + build URL. R2 in production, local public/uploads/ in dev.
    const generationId = randomUUID();
    const filename = `${data.generated_at.replace(/[:.]/g, "-")}-${generationId}.pdf`;
    let pdfPath: string;
    let pdfUrl: string;

    if (r2IsConfigured()) {
      const key = `paperwork/${userId}/insurance/${filename}`;
      await r2PutObject(key, pdfBuffer, "application/pdf");
      pdfPath = key;
      pdfUrl = await r2GetPresignedUrl(key);
    } else {
      // Local-dev fallback. Writes to public/uploads/paperwork/... which
      // serves via /uploads/... in dev. Production never hits this branch.
      const localDir = path.join(process.cwd(), "public", "uploads", "paperwork", userId, "insurance");
      await fs.mkdir(localDir, { recursive: true });
      const fullPath = path.join(localDir, filename);
      await fs.writeFile(fullPath, pdfBuffer);
      pdfPath = `uploads/paperwork/${userId}/insurance/${filename}`;
      pdfUrl = `/${pdfPath}`;
    }

    // Log to paperwork_generations.
    const logRow = await queryOne<{ id: string }>(
      `INSERT INTO paperwork_generations
        (id, user_id, kind, generated_at, item_count, total_insured_value, pdf_path)
       VALUES ($1, $2, 'insurance', NOW(), $3, $4, $5)
       RETURNING id`,
      [generationId, userId, summary.item_count, summary.total_insured_value, pdfPath],
    );

    const elapsedMs = Date.now() - t0;
    console.log(
      `[paperwork] insurance pdf user_id=${userId} item_count=${summary.item_count} ` +
        `total=${summary.total_insured_value.toFixed(2)} pdf_path=${pdfPath} ms=${elapsedMs}`,
    );

    return NextResponse.json({
      id: logRow?.id ?? generationId,
      pdf_url: pdfUrl,
      generated_at: data.generated_at,
      item_count: summary.item_count,
      total_insured_value: summary.total_insured_value,
    });
  } catch (error) {
    console.error("POST /api/paperwork/insurance/export error:", error);
    return NextResponse.json({ error: "Failed to generate insurance PDF" }, { status: 500 });
  }
}
