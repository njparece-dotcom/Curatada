import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { GuitarCategory, GuitarItem, GuitarImage } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as GuitarCategory | null;

    let itemsQuery = `
      SELECT gi.*,
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
        ) AS images,
        MAX(ai_val.price) AS latest_ai_price,
        MAX(ai_val.created_at) AS latest_ai_price_date,
        MAX(user_val.price) AS latest_user_price,
        MAX(user_val.created_at) AS latest_user_price_date
      FROM guitar_items gi
      LEFT JOIN guitar_images img ON img.guitar_item_id = gi.id
      LEFT JOIN LATERAL (
        SELECT price, created_at FROM guitar_valuations
        WHERE guitar_item_id = gi.id AND valuation_type = 'ai'
        ORDER BY created_at DESC LIMIT 1
      ) ai_val ON true
      LEFT JOIN LATERAL (
        SELECT price, created_at FROM guitar_valuations
        WHERE guitar_item_id = gi.id AND valuation_type = 'user'
        ORDER BY created_at DESC LIMIT 1
      ) user_val ON true
    `;

    const params: unknown[] = [session.user.id];
    itemsQuery += ` WHERE gi.user_id = $1`;
    if (category) {
      itemsQuery += ` AND gi.category = $2`;
      params.push(category);
    }

    itemsQuery += ` GROUP BY gi.id ORDER BY gi.created_at DESC`;

    const items = await query<GuitarItem & { images: GuitarImage[] }>(
      itemsQuery,
      params
    );

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/guitars error:", error);
    return NextResponse.json(
      { error: "Failed to fetch guitar items" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      image_paths,
    } = body;

    if (!category || !brand || !model || !condition) {
      return NextResponse.json(
        { error: "category, brand, model, and condition are required" },
        { status: 400 }
      );
    }

    const validCategories = [
      "electric-guitars",
      "acoustic-guitars",
      "amplifiers",
      "pedals",
    ];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    const validConditions = [
      "Mint",
      "Excellent",
      "Very Good",
      "Good",
      "Fair",
      "Poor",
    ];
    if (!validConditions.includes(condition)) {
      return NextResponse.json(
        { error: "Invalid condition" },
        { status: 400 }
      );
    }

    const item = await queryOne<GuitarItem>(
      `INSERT INTO guitar_items
        (category, brand, model, year, serial_number, condition, purchase_price, purchase_source, color_finish, short_description, link, notes, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        category,
        brand,
        model,
        year || null,
        serial_number || null,
        condition,
        purchase_price || null,
        purchase_source || null,
        color_finish || null,
        short_description || null,
        link || null,
        notes || null,
        session.user.id,
      ]
    );

    if (!item) {
      throw new Error("Failed to create item");
    }

    // Insert images if provided
    if (image_paths && Array.isArray(image_paths) && image_paths.length > 0) {
      for (let i = 0; i < image_paths.length; i++) {
        const imgData = image_paths[i];
        await query(
          `INSERT INTO guitar_images (guitar_item_id, filename, original_name, path, mime_type, size, is_primary, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            item.id,
            imgData.filename,
            imgData.original_name,
            imgData.path,
            imgData.mime_type || null,
            imgData.size || null,
            i === 0,
            i,
          ]
        );
      }
    }

    // Fetch the complete item with images
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
        ) AS images,
        NULL::numeric AS latest_ai_price,
        NULL::timestamptz AS latest_ai_price_date,
        NULL::numeric AS latest_user_price,
        NULL::timestamptz AS latest_user_price_date
       FROM guitar_items gi
       LEFT JOIN guitar_images img ON img.guitar_item_id = gi.id
       WHERE gi.id = $1
       GROUP BY gi.id`,
      [item.id]
    );

    return NextResponse.json(fullItem, { status: 201 });
  } catch (error) {
    console.error("POST /api/guitars error:", error);
    return NextResponse.json(
      { error: "Failed to create guitar item" },
      { status: 500 }
    );
  }
}
