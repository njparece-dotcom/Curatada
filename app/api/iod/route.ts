import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { IoDCategory, IoDItem, IoDImage } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as IoDCategory | null;

    let itemsQuery = `
      SELECT i.*,
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
        ) AS images,
        MAX(ai_val.price) AS latest_ai_price,
        MAX(ai_val.created_at) AS latest_ai_price_date,
        MAX(user_val.price) AS latest_user_price,
        MAX(user_val.created_at) AS latest_user_price_date
      FROM items_of_distinction i
      LEFT JOIN iod_images img ON img.iod_id = i.id
      LEFT JOIN LATERAL (
        SELECT price, created_at FROM iod_valuations
        WHERE iod_id = i.id AND valuation_type = 'ai'
        ORDER BY created_at DESC LIMIT 1
      ) ai_val ON true
      LEFT JOIN LATERAL (
        SELECT price, created_at FROM iod_valuations
        WHERE iod_id = i.id AND valuation_type = 'user'
        ORDER BY created_at DESC LIMIT 1
      ) user_val ON true
    `;

    const params: unknown[] = [session.user.id];
    itemsQuery += ` WHERE i.user_id = $1`;
    if (category) {
      itemsQuery += ` AND i.category = $2`;
      params.push(category);
    }

    itemsQuery += ` GROUP BY i.id ORDER BY i.created_at DESC`;

    const items = await query<IoDItem & { images: IoDImage[] }>(
      itemsQuery,
      params
    );

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/iod error:", error);
    return NextResponse.json(
      { error: "Failed to fetch items of distinction" },
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
      image_paths,
    } = body;

    if (!category || !short_description) {
      return NextResponse.json(
        { error: "category and short_description are required" },
        { status: 400 }
      );
    }

    const validCategories = ["fine-art", "memorabilia", "collectibles", "jewelry", "other"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    const item = await queryOne<IoDItem>(
      `INSERT INTO items_of_distinction
        (category, item_type, brand, short_description, long_description, year, condition, purchase_price, purchase_date, purchase_source, provenance, notes, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        category,
        item_type || null,
        brand || null,
        short_description,
        long_description || null,
        year || null,
        condition || null,
        purchase_price || null,
        purchase_date || null,
        purchase_source || null,
        provenance || null,
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
          `INSERT INTO iod_images (iod_id, filename, original_name, path, mime_type, size, is_primary, sort_order)
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
        ) AS images,
        NULL::numeric AS latest_ai_price,
        NULL::timestamptz AS latest_ai_price_date,
        NULL::numeric AS latest_user_price,
        NULL::timestamptz AS latest_user_price_date
       FROM items_of_distinction i
       LEFT JOIN iod_images img ON img.iod_id = i.id
       WHERE i.id = $1
       GROUP BY i.id`,
      [item.id]
    );

    return NextResponse.json(fullItem, { status: 201 });
  } catch (error) {
    console.error("POST /api/iod error:", error);
    return NextResponse.json(
      { error: "Failed to create item of distinction" },
      { status: 500 }
    );
  }
}
