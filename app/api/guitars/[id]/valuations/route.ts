import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { query, queryOne } from "@/lib/db";
import { GuitarValuation } from "@/lib/types";

// Auth note: these handlers used to skip the session check entirely,
// relying on the NextAuth middleware to gate "signed in". The middleware
// rewrite (lib-api-auth route) means Bearer requests now reach this
// handler — so we authenticate here AND verify the user owns the parent
// row before returning its valuation history.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getApiSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const owner = await queryOne<{ id: string }>(
      "SELECT id FROM guitar_items WHERE id = $1 AND user_id = $2",
      [id, session.user.id]
    );
    if (!owner) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    const valuations = await query<GuitarValuation>(
      `SELECT * FROM guitar_valuations
       WHERE guitar_item_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    return NextResponse.json(valuations);
  } catch (error) {
    console.error("GET /api/guitars/[id]/valuations error:", error);
    return NextResponse.json({ error: "Failed to fetch valuations" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getApiSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const { price, notes } = body;

    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      return NextResponse.json({ error: "A valid price is required" }, { status: 400 });
    }

    const owner = await queryOne<{ id: string }>(
      "SELECT id FROM guitar_items WHERE id = $1 AND user_id = $2",
      [id, session.user.id]
    );
    if (!owner) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const valuation = await queryOne<GuitarValuation>(
      `INSERT INTO guitar_valuations (guitar_item_id, valuation_type, price, notes)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [id, Number(price), notes || null]
    );

    return NextResponse.json(valuation, { status: 201 });
  } catch (error) {
    console.error("POST /api/guitars/[id]/valuations error:", error);
    return NextResponse.json({ error: "Failed to save valuation" }, { status: 500 });
  }
}
