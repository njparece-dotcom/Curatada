import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { AutoCategory, AutoItem, AutoImage } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as AutoCategory | null;

    let itemsQuery = `
      SELECT a.*,
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
        ) AS images,
        MAX(ai_val.price) AS latest_ai_price,
        MAX(ai_val.created_at) AS latest_ai_price_date,
        MAX(user_val.price) AS latest_user_price,
        MAX(user_val.created_at) AS latest_user_price_date
      FROM automobiles a
      LEFT JOIN auto_images img ON img.auto_id = a.id
      LEFT JOIN LATERAL (
        SELECT price, created_at FROM auto_valuations
        WHERE auto_id = a.id AND valuation_type = 'ai'
        ORDER BY created_at DESC LIMIT 1
      ) ai_val ON true
      LEFT JOIN LATERAL (
        SELECT price, created_at FROM auto_valuations
        WHERE auto_id = a.id AND valuation_type = 'user'
        ORDER BY created_at DESC LIMIT 1
      ) user_val ON true
    `;

    const params: unknown[] = [session.user.id];
    itemsQuery += ` WHERE a.user_id = $1`;
    if (category) {
      itemsQuery += ` AND a.category = $2`;
      params.push(category);
    }

    itemsQuery += ` GROUP BY a.id ORDER BY a.created_at DESC`;

    const items = await query<AutoItem & { images: AutoImage[] }>(
      itemsQuery,
      params
    );

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/automobiles error:", error);
    return NextResponse.json(
      { error: "Failed to fetch automobile items" },
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
      image_paths,
    } = body;

    if (!category || !brand || !model) {
      return NextResponse.json(
        { error: "category, brand, and model are required" },
        { status: 400 }
      );
    }

    const validCategories = ["collection", "household"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    const item = await queryOne<AutoItem>(
      `INSERT INTO automobiles
        (category, brand, model, year, description, trim_level, engine, transmission, mileage, condition, body_style, color, vin, purchase_price, purchase_date, purchase_source, notes, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        category,
        brand,
        model,
        year || null,
        description || null,
        trim_level || null,
        engine || null,
        transmission || null,
        mileage || null,
        condition || null,
        body_style || null,
        color || null,
        vin || null,
        purchase_price || null,
        purchase_date || null,
        purchase_source || null,
        notes || null,
        session.user.id,
      ]
    );

    if (!item) {
      throw new Error("Failed to create item");
    }

    if (image_paths && Array.isArray(image_paths) && image_paths.length > 0) {
      for (let i = 0; i < image_paths.length; i++) {
        const imgData = image_paths[i];
        await query(
          `INSERT INTO auto_images (auto_id, filename, original_name, path, mime_type, size, is_primary, sort_order)
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
        ) AS images,
        NULL::numeric AS latest_ai_price,
        NULL::timestamptz AS latest_ai_price_date,
        NULL::numeric AS latest_user_price,
        NULL::timestamptz AS latest_user_price_date
       FROM automobiles a
       LEFT JOIN auto_images img ON img.auto_id = a.id
       WHERE a.id = $1
       GROUP BY a.id`,
      [item.id]
    );

    return NextResponse.json(fullItem, { status: 201 });
  } catch (error) {
    console.error("POST /api/automobiles error:", error);
    return NextResponse.json(
      { error: "Failed to create automobile item" },
      { status: 500 }
    );
  }
}
