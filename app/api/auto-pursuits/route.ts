import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { AutoPursuit } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pursuits = await query<AutoPursuit>(
      `SELECT * FROM auto_pursuits WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.user.id]
    );
    return NextResponse.json(pursuits);
  } catch (error) {
    console.error("GET /api/auto-pursuits error:", error);
    return NextResponse.json(
      { error: "Failed to fetch auto pursuits" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const {
      brand,
      model,
      year_min,
      year_max,
      body_style,
      color,
      mileage_max,
      price_min,
      price_max,
      sources,
      facebook_location,
      exclude_terms,
      notes,
      status,
    } = body;

    const pursuit = await queryOne<AutoPursuit>(
      `INSERT INTO auto_pursuits
        (brand, model, year_min, year_max, body_style, color, mileage_max, price_min, price_max, sources, facebook_location, exclude_terms, notes, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        brand || null,
        model || null,
        year_min || null,
        year_max || null,
        body_style || null,
        color || null,
        mileage_max || null,
        price_min || null,
        price_max || null,
        sources && Array.isArray(sources) ? sources : [],
        facebook_location || null,
        exclude_terms || null,
        notes || null,
        status || "active",
        session.user.id,
      ]
    );

    if (!pursuit) {
      throw new Error("Failed to create pursuit");
    }

    return NextResponse.json(pursuit, { status: 201 });
  } catch (error) {
    console.error("POST /api/auto-pursuits error:", error);
    return NextResponse.json(
      { error: "Failed to create auto pursuit" },
      { status: 500 }
    );
  }
}
