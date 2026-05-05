import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { AutoItem, AutoImage } from "@/lib/types";
import path from "path";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = params;

    const item = await queryOne<AutoItem & { images: AutoImage[] }>(
      `SELECT a.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', img.id,
              'auto_id', img.auto_id,
              'filename', img.filename,
              'original_name', img.original_name,
              'path', img.path,
              'mime_type', img.mime_type,
              'size', img.size,
              'is_primary', img.is_primary,
              'sort_order', img.sort_order,
              'created_at', img.created_at
            ) ORDER BY img.sort_order ASC, img.is_primary DESC, img.created_at ASC
          ) FILTER (WHERE img.id IS NOT NULL),
          '[]'::json
        ) AS images
       FROM automobiles a
       LEFT JOIN auto_images img ON img.auto_id = a.id
       WHERE a.id = $1 AND a.user_id = $2
       GROUP BY a.id`,
      [id, session.user.id]
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("GET /api/automobiles/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch automobile item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = params;

    const images = await query<AutoImage>(
      `SELECT * FROM auto_images WHERE auto_id = $1`,
      [id]
    );

    const deleted = await queryOne<AutoItem>(
      `DELETE FROM automobiles WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, session.user.id]
    );

    if (!deleted) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    for (const image of images) {
      try {
        const filePath = path.join(uploadsDir, image.filename);
        await fs.unlink(filePath);
      } catch {
        // File may not exist, ignore
      }
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error("DELETE /api/automobiles/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete automobile item" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = params;
    const body = await request.json();
    const {
      category,
      brand,
      model,
      year,
      description,
      trim_level,
      engine,
      transmission,
      mileage,
      condition,
      body_style,
      color,
      vin,
      purchase_price,
      purchase_date,
      purchase_source,
      notes,
      images_to_delete,
      image_paths,
      image_order,
    } = body;

    if (!brand?.trim() || !model?.trim()) {
      return NextResponse.json(
        { error: "brand and model are required" },
        { status: 400 }
      );
    }

    const item = await queryOne<AutoItem>(
      `UPDATE automobiles SET
        category = COALESCE($1, category),
        brand = $2,
        model = $3,
        year = $4,
        description = $5,
        trim_level = $6,
        engine = $7,
        transmission = $8,
        mileage = $9,
        condition = $10,
        body_style = $11,
        color = $12,
        vin = $13,
        purchase_price = $14,
        purchase_date = $15,
        purchase_source = $16,
        notes = $17,
        updated_at = NOW()
       WHERE id = $18 AND user_id = $19
       RETURNING *`,
      [
        category || null,
        brand.trim(),
        model.trim(),
        year || null,
        description?.trim() || null,
        trim_level?.trim() || null,
        engine?.trim() || null,
        transmission?.trim() || null,
        mileage || null,
        condition || null,
        body_style?.trim() || null,
        color?.trim() || null,
        vin?.trim() || null,
        purchase_price || null,
        purchase_date || null,
        purchase_source?.trim() || null,
        notes?.trim() || null,
        id,
        session.user.id,
      ]
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (Array.isArray(image_order) && image_order.length > 0) {
      for (let i = 0; i < image_order.length; i++) {
        await query(
          `UPDATE auto_images SET sort_order = $1, is_primary = $2
           WHERE id = $3 AND auto_id = $4`,
          [i, i === 0, image_order[i], id]
        );
      }
    }

    if (Array.isArray(images_to_delete) && images_to_delete.length > 0) {
      const deletedImgs = await query<AutoImage>(
        `DELETE FROM auto_images WHERE id = ANY($1::uuid[]) AND auto_id = $2 RETURNING *`,
        [images_to_delete, id]
      );
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      for (const img of deletedImgs) {
        try { await fs.unlink(path.join(uploadsDir, img.filename)); } catch { /* ignore */ }
      }
    }

    if (Array.isArray(image_paths) && image_paths.length > 0) {
      const existingCount = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM auto_images WHERE auto_id = $1`,
        [id]
      );
      const hasExisting = parseInt(existingCount?.count ?? "0") > 0;
      const existingOrderCount = Array.isArray(image_order) ? image_order.length : (hasExisting ? parseInt(existingCount?.count ?? "0") : 0);
      for (let i = 0; i < image_paths.length; i++) {
        const imgData = image_paths[i];
        const sortOrder = existingOrderCount + i;
        await query(
          `INSERT INTO auto_images (auto_id, filename, original_name, path, mime_type, size, is_primary, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            imgData.filename,
            imgData.original_name,
            imgData.path,
            imgData.mime_type || null,
            imgData.size || null,
            !hasExisting && i === 0,
            sortOrder,
          ]
        );
      }
    }

    const fullItem = await queryOne<AutoItem & { images: AutoImage[] }>(
      `SELECT a.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', img.id,
              'auto_id', img.auto_id,
              'filename', img.filename,
              'original_name', img.original_name,
              'path', img.path,
              'mime_type', img.mime_type,
              'size', img.size,
              'is_primary', img.is_primary,
              'sort_order', img.sort_order,
              'created_at', img.created_at
            ) ORDER BY img.sort_order ASC, img.is_primary DESC, img.created_at ASC
          ) FILTER (WHERE img.id IS NOT NULL),
          '[]'::json
        ) AS images
       FROM automobiles a
       LEFT JOIN auto_images img ON img.auto_id = a.id
       WHERE a.id = $1
       GROUP BY a.id`,
      [id]
    );

    return NextResponse.json(fullItem);
  } catch (error) {
    console.error("PATCH /api/automobiles/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update automobile item" },
      { status: 500 }
    );
  }
}
