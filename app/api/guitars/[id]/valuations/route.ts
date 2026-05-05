import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { GuitarValuation } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const valuations = await query<GuitarValuation>(
      `SELECT * FROM guitar_valuations
       WHERE guitar_item_id = $1
       ORDER BY created_at DESC`,
      [params.id]
    );
    return NextResponse.json(valuations);
  } catch (error) {
    console.error("GET /api/guitars/[id]/valuations error:", error);
    return NextResponse.json({ error: "Failed to fetch valuations" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { price, notes } = body;

    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      return NextResponse.json({ error: "A valid price is required" }, { status: 400 });
    }

    const valuation = await queryOne<GuitarValuation>(
      `INSERT INTO guitar_valuations (guitar_item_id, valuation_type, price, notes)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [params.id, Number(price), notes || null]
    );

    return NextResponse.json(valuation, { status: 201 });
  } catch (error) {
    console.error("POST /api/guitars/[id]/valuations error:", error);
    return NextResponse.json({ error: "Failed to save valuation" }, { status: 500 });
  }
}
