import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

interface IoDValuation {
  id: string;
  iod_id: string;
  valuation_type: "ai" | "user";
  price: number;
  notes: string | null;
  comparable_sales: unknown[] | null;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const valuations = await query<IoDValuation>(
      `SELECT * FROM iod_valuations
       WHERE iod_id = $1
       ORDER BY created_at DESC`,
      [params.id]
    );
    return NextResponse.json(valuations);
  } catch (error) {
    console.error("GET /api/iod/[id]/valuations error:", error);
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

    // Verify parent exists
    const parent = await queryOne<{ id: string }>(
      `SELECT id FROM items_of_distinction WHERE id = $1`,
      [params.id]
    );
    if (!parent) {
      return NextResponse.json({ error: "Item of distinction not found" }, { status: 404 });
    }

    const valuation = await queryOne<IoDValuation>(
      `INSERT INTO iod_valuations (iod_id, valuation_type, price, notes)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [params.id, Number(price), notes || null]
    );

    return NextResponse.json(valuation, { status: 201 });
  } catch (error) {
    console.error("POST /api/iod/[id]/valuations error:", error);
    return NextResponse.json({ error: "Failed to save valuation" }, { status: 500 });
  }
}
