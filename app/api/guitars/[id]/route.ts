import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { GuitarItem, GuitarImage } from "@/lib/types";
import path from "path";
import fs from "fs/promises";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = params;

    const item = await queryOne<GuitarItem & { images: GuitarImage[] }>(
      `SELECT gi.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', img.id,
              'guitar_item_id', img.guitar_item_id,
              'filename', img.filename,
              'original_name', img.original_name,
              'path', img.path,
              'mime_type', img.mime_type,
              'size', img.size,
              'is_primary', img.is_primary,
              'created_at', img.created_at
            ) ORDER BY img.sort_order ASC, img.is_primary DESC, img.created_at ASC
          ) FILTER (WHERE img.id IS NOT NULL),
          '[]'::json
        ) AS images
       FROM guitar_items gi
       LEFT JOIN guitar_images img ON img.guitar_item_id = gi.id
       WHERE gi.id = $1 AND gi.user_id = $2
       GROUP BY gi.id`,
      [id, session.user.id]
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("GET /api/guitars/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch guitar item" },
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

    // Fetch images first so we can delete the files
    const images = await query<GuitarImage>(
      `SELECT * FROM guitar_images WHERE guitar_item_id = $1`,
      [id]
    );

    // Delete the item (cascade will remove images rows)
    const deleted = await queryOne<GuitarItem>(
      `DELETE FROM guitar_items WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, session.user.id]
    );

    if (!deleted) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Delete image files from disk
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
    console.error("DELETE /api/guitars/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete guitar item" },
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
      serial_number,
      condition,
      purchase_price,
      purchase_source,
      color_finish,
      short_description,
      link,
      notes,
      images_to_delete,
      image_paths,
      image_order,
    } = body;

    if (!brand?.trim() || !model?.trim() || !condition) {
      return NextResponse.json(
        { error: "brand, model, and condition are required" },
        { status: 400 }
      );
    }

    const item = await queryOne<GuitarItem>(
      `UPDATE guitar_items SET
        category = COALESCE($1, category),
        brand = $2,
        model = $3,
        year = $4,
        serial_number = $5,
        condition = $6,
        purchase_price = $7,
        purchase_source = $8,
        color_finish = $9,
        short_description = $10,
        link = $11,
        notes = $12
       WHERE id = $13 AND user_id = $14
       RETURNING *`,
      [
        category || null,
        brand.trim(),
        model.trim(),
        year || null,
        serial_number?.trim() || null,
        condition,
        purchase_price || null,
        purchase_source?.trim() || null,
        color_finish?.trim() || null,
        short_description?.trim() || null,
        link?.trim() || null,
        notes?.trim() || null,
        id,
        session.user.id,
      ]
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Update sort_order for existing images when reordered
    if (Array.isArray(image_order) && image_order.length > 0) {
      for (let i = 0; i < image_order.length; i++) {
        await query(
          `UPDATE guitar_images SET sort_order = $1, is_primary = $2
           WHERE id = $3 AND guitar_item_id = $4`,
          [i, i === 0, image_order[i], id]
        );
      }
    }

    // Delete removed images
    if (Array.isArray(images_to_delete) && images_to_delete.length > 0) {
      const deletedImgs = await query<GuitarImage>(
        `DELETE FROM guitar_images WHERE id = ANY($1::uuid[]) AND guitar_item_id = $2 RETURNING *`,
        [images_to_delete, id]
      );
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      for (const img of deletedImgs) {
        try { await fs.unlink(path.join(uploadsDir, img.filename)); } catch { /* ignore */ }
      }
    }

    // Add new images
    if (Array.isArray(image_paths) && image_paths.length > 0) {
      // Check if item has any existing images to determine primary
      const existingCount = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM guitar_images WHERE guitar_item_id = $1`,
        [id]
      );
      const hasExisting = parseInt(existingCount?.count ?? "0") > 0;
      // Offset sort_order by the number of non-deleted existing images
      const existingOrderCount = Array.isArray(image_order) ? image_order.length : (hasExisting ? parseInt(existingCount?.count ?? "0") : 0);
      for (let i = 0; i < image_paths.length; i++) {
        const imgData = image_paths[i];
        const sortOrder = existingOrderCount + i;
        await query(
          `INSERT INTO guitar_images (guitar_item_id, filename, original_name, path, mime_type, size, is_primary, sort_order)
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

    // Return full item with images
    const fullItem = await queryOne<GuitarItem & { images: GuitarImage[] }>(
      `SELECT gi.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', img.id,
              'guitar_item_id', img.guitar_item_id,
              'filename', img.filename,
              'original_name', img.original_name,
              'path', img.path,
              'mime_type', img.mime_type,
              'size', img.size,
              'is_primary', img.is_primary,
              'created_at', img.created_at
            ) ORDER BY img.sort_order ASC, img.is_primary DESC, img.created_at ASC
          ) FILTER (WHERE img.id IS NOT NULL),
          '[]'::json
        ) AS images
       FROM guitar_items gi
       LEFT JOIN guitar_images img ON img.guitar_item_id = gi.id
       WHERE gi.id = $1
       GROUP BY gi.id`,
      [id]
    );

    return NextResponse.json(fullItem);
  } catch (error) {
    console.error("PATCH /api/guitars/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update guitar item" },
      { status: 500 }
    );
  }
}
