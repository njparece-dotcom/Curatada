import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { WatchItem, WatchImage } from "@/lib/types";
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

    const item = await queryOne<WatchItem & { images: WatchImage[] }>(
      `SELECT wi.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', img.id,
              'watch_item_id', img.watch_item_id,
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
       FROM watch_items wi
       LEFT JOIN watch_images img ON img.watch_item_id = wi.id
       WHERE wi.id = $1 AND wi.user_id = $2
       GROUP BY wi.id`,
      [id, session.user.id]
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("GET /api/watches/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch watch item" },
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
    const images = await query<WatchImage>(
      `SELECT * FROM watch_images WHERE watch_item_id = $1`,
      [id]
    );

    // Delete the item (cascade will remove images rows)
    const deleted = await queryOne<WatchItem>(
      `DELETE FROM watch_items WHERE id = $1 AND user_id = $2 RETURNING *`,
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
    console.error("DELETE /api/watches/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete watch item" },
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
      reference_number,
      case_diameter,
      serial_number,
      condition,
      purchase_price,
      purchase_source,
      dial_color,
      country_of_manufacture,
      movement,
      bracelet_material,
      case_material,
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

    const item = await queryOne<WatchItem>(
      `UPDATE watch_items SET
        category = COALESCE($1, category),
        brand = $2,
        model = $3,
        year = $4,
        reference_number = $5,
        case_diameter = $6,
        serial_number = $7,
        condition = $8,
        purchase_price = $9,
        purchase_source = $10,
        dial_color = $11,
        country_of_manufacture = $12,
        movement = $13,
        bracelet_material = $14,
        case_material = $15,
        short_description = $16,
        link = $17,
        notes = $18
       WHERE id = $19 AND user_id = $20
       RETURNING *`,
      [
        category || null,
        brand.trim(),
        model.trim(),
        year || null,
        reference_number?.trim() || null,
        case_diameter?.trim() || null,
        serial_number?.trim() || null,
        condition,
        purchase_price || null,
        purchase_source?.trim() || null,
        dial_color?.trim() || null,
        country_of_manufacture?.trim() || null,
        movement?.trim() || null,
        bracelet_material?.trim() || null,
        case_material?.trim() || null,
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
          `UPDATE watch_images SET sort_order = $1, is_primary = $2
           WHERE id = $3 AND watch_item_id = $4`,
          [i, i === 0, image_order[i], id]
        );
      }
    }

    // Delete removed images
    if (Array.isArray(images_to_delete) && images_to_delete.length > 0) {
      const deletedImgs = await query<WatchImage>(
        `DELETE FROM watch_images WHERE id = ANY($1::uuid[]) AND watch_item_id = $2 RETURNING *`,
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
        `SELECT COUNT(*) as count FROM watch_images WHERE watch_item_id = $1`,
        [id]
      );
      const hasExisting = parseInt(existingCount?.count ?? "0") > 0;
      const existingOrderCount = Array.isArray(image_order) ? image_order.length : (hasExisting ? parseInt(existingCount?.count ?? "0") : 0);
      for (let i = 0; i < image_paths.length; i++) {
        const imgData = image_paths[i];
        const sortOrder = existingOrderCount + i;
        await query(
          `INSERT INTO watch_images (watch_item_id, filename, original_name, path, mime_type, size, is_primary, sort_order)
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
    const fullItem = await queryOne<WatchItem & { images: WatchImage[] }>(
      `SELECT wi.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', img.id,
              'watch_item_id', img.watch_item_id,
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
       FROM watch_items wi
       LEFT JOIN watch_images img ON img.watch_item_id = wi.id
       WHERE wi.id = $1
       GROUP BY wi.id`,
      [id]
    );

    return NextResponse.json(fullItem);
  } catch (error) {
    console.error("PATCH /api/watches/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update watch item" },
      { status: 500 }
    );
  }
}
