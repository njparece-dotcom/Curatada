import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { WatchCategory, WatchItem, WatchImage } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as WatchCategory | null;

    let itemsQuery = `
      SELECT wi.*,
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
        ) AS images,
        MAX(ai_val.price) AS latest_ai_price,
        MAX(ai_val.created_at) AS latest_ai_price_date,
        MAX(user_val.price) AS latest_user_price,
        MAX(user_val.created_at) AS latest_user_price_date
      FROM watch_items wi
      LEFT JOIN watch_images img ON img.watch_item_id = wi.id
      LEFT JOIN LATERAL (
        SELECT price, created_at FROM watch_valuations
        WHERE watch_item_id = wi.id AND valuation_type = 'ai'
        ORDER BY created_at DESC LIMIT 1
      ) ai_val ON true
      LEFT JOIN LATERAL (
        SELECT price, created_at FROM watch_valuations
        WHERE watch_item_id = wi.id AND valuation_type = 'user'
        ORDER BY created_at DESC LIMIT 1
      ) user_val ON true
    `;

    const params: unknown[] = [session.user.id];
    itemsQuery += ` WHERE wi.user_id = $1`;
    if (category) {
      itemsQuery += ` AND wi.category = $2`;
      params.push(category);
    }

    itemsQuery += ` GROUP BY wi.id ORDER BY wi.created_at DESC`;

    const items = await query<WatchItem & { images: WatchImage[] }>(
      itemsQuery,
      params
    );

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/watches error:", error);
    return NextResponse.json(
      { error: "Failed to fetch watch items" },
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
      image_paths,
    } = body;

    if (!category || !brand || !model || !condition) {
      return NextResponse.json(
        { error: "category, brand, model, and condition are required" },
        { status: 400 }
      );
    }

    const validCategories = [
      "luxury-watches",
      "sport-watches",
      "dress-watches",
      "vintage-watches",
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

    const item = await queryOne<WatchItem>(
      `INSERT INTO watch_items
        (category, brand, model, year, reference_number, case_diameter, serial_number, condition,
         purchase_price, purchase_source, dial_color, country_of_manufacture, movement,
         bracelet_material, case_material, short_description, link, notes, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        category,
        brand,
        model,
        year || null,
        reference_number || null,
        case_diameter || null,
        serial_number || null,
        condition,
        purchase_price || null,
        purchase_source || null,
        dial_color || null,
        country_of_manufacture || null,
        movement || null,
        bracelet_material || null,
        case_material || null,
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
          `INSERT INTO watch_images (watch_item_id, filename, original_name, path, mime_type, size, is_primary, sort_order)
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
        ) AS images,
        NULL::numeric AS latest_ai_price,
        NULL::timestamptz AS latest_ai_price_date,
        NULL::numeric AS latest_user_price,
        NULL::timestamptz AS latest_user_price_date
       FROM watch_items wi
       LEFT JOIN watch_images img ON img.watch_item_id = wi.id
       WHERE wi.id = $1
       GROUP BY wi.id`,
      [item.id]
    );

    return NextResponse.json(fullItem, { status: 201 });
  } catch (error) {
    console.error("POST /api/watches error:", error);
    return NextResponse.json(
      { error: "Failed to create watch item" },
      { status: 500 }
    );
  }
}
