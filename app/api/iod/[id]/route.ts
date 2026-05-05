import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { IoDItem, IoDImage } from "@/lib/types";
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

    const item = await queryOne<IoDItem & { images: IoDImage[] }>(
      `SELECT i.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', img.id,
              'iod_id', img.iod_id,
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
       FROM items_of_distinction i
       LEFT JOIN iod_images img ON img.iod_id = i.id
       WHERE i.id = $1 AND i.user_id = $2
       GROUP BY i.id`,
      [id, session.user.id]
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("GET /api/iod/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch item of distinction" },
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

    const images = await query<IoDImage>(
      `SELECT * FROM iod_images WHERE iod_id = $1`,
      [id]
    );

    const deleted = await queryOne<IoDItem>(
      `DELETE FROM items_of_distinction WHERE id = $1 AND user_id = $2 RETURNING *`,
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
    console.error("DELETE /api/iod/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete item of distinction" },
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
      item_type,
      brand,
      short_description,
      long_description,
      year,
      condition,
      purchase_price,
      purchase_date,
      purchase_source,
      provenance,
      notes,
      images_to_delete,
      image_paths,
      image_order,
    } = body;

    if (!short_description?.trim()) {
      return NextResponse.json(
        { error: "short_description is required" },
        { status: 400 }
      );
    }

    const item = await queryOne<IoDItem>(
      `UPDATE items_of_distinction SET
        category = COALESCE($1, category),
        item_type = $2,
        brand = $3,
        short_description = $4,
        long_description = $5,
        year = $6,
        condition = $7,
        purchase_price = $8,
        purchase_date = $9,
        purchase_source = $10,
        provenance = $11,
        notes = $12,
        updated_at = NOW()
       WHERE id = $13 AND user_id = $14
       RETURNING *`,
      [
        category || null,
        item_type?.trim() || null,
        brand?.trim() || null,
        short_description.trim(),
        long_description?.trim() || null,
        year || null,
        condition || null,
        purchase_price || null,
        purchase_date || null,
        purchase_source?.trim() || null,
        provenance?.trim() || null,
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
          `UPDATE iod_images SET sort_order = $1, is_primary = $2
           WHERE id = $3 AND iod_id = $4`,
          [i, i === 0, image_order[i], id]
        );
      }
    }

    if (Array.isArray(images_to_delete) && images_to_delete.length > 0) {
      const deletedImgs = await query<IoDImage>(
        `DELETE FROM iod_images WHERE id = ANY($1::uuid[]) AND iod_id = $2 RETURNING *`,
        [images_to_delete, id]
      );
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      for (const img of deletedImgs) {
        try { await fs.unlink(path.join(uploadsDir, img.filename)); } catch { /* ignore */ }
      }
    }

    if (Array.isArray(image_paths) && image_paths.length > 0) {
      const existingCount = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM iod_images WHERE iod_id = $1`,
        [id]
      );
      const hasExisting = parseInt(existingCount?.count ?? "0") > 0;
      const existingOrderCount = Array.isArray(image_order) ? image_order.length : (hasExisting ? parseInt(existingCount?.count ?? "0") : 0);
      for (let i = 0; i < image_paths.length; i++) {
        const imgData = image_paths[i];
        const sortOrder = existingOrderCount + i;
        await query(
          `INSERT INTO iod_images (iod_id, filename, original_name, path, mime_type, size, is_primary, sort_order)
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

    const fullItem = await queryOne<IoDItem & { images: IoDImage[] }>(
      `SELECT i.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', img.id,
              'iod_id', img.iod_id,
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
       FROM items_of_distinction i
       LEFT JOIN iod_images img ON img.iod_id = i.id
       WHERE i.id = $1
       GROUP BY i.id`,
      [id]
    );

    return NextResponse.json(fullItem);
  } catch (error) {
    console.error("PATCH /api/iod/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update item of distinction" },
      { status: 500 }
    );
  }
}
