import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

interface AutoValuation {
  id: string;
  auto_id: string;
  valuation_type: "ai" | "user";
  price: number;
  notes: string | null;
  comparable_sales: unknown[] | null;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const valuations = await query<AutoValuation>(
      `SELECT * FROM auto_valuations
       WHERE auto_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    return NextResponse.json(valuations);
  } catch (error) {
    console.error("GET /api/automobiles/[id]/valuations error:", error);
    return NextResponse.json({ error: "Failed to fetch valuations" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { price, notes } = body;

    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      return NextResponse.json({ error: "A valid price is required" }, { status: 400 });
    }

    // Verify parent exists
    const parent = await queryOne<{ id: string }>(
      `SELECT id FROM automobiles WHERE id = $1`,
      [id]
    );
    if (!parent) {
      return NextResponse.json({ error: "Automobile not found" }, { status: 404 });
    }

    const valuation = await queryOne<AutoValuation>(
      `INSERT INTO auto_valuations (auto_id, valuation_type, price, notes)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [id, Number(price), notes || null]
    );

    return NextResponse.json(valuation, { status: 201 });
  } catch (error) {
    console.error("POST /api/automobiles/[id]/valuations error:", error);
    return NextResponse.json({ error: "Failed to save valuation" }, { status: 500 });
  }
}
