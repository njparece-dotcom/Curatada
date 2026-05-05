import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { AutoPursuit } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pursuit = await queryOne<AutoPursuit>(
      `SELECT * FROM auto_pursuits WHERE id = $1 AND user_id = $2`,
      [params.id, session.user.id]
    );

    if (!pursuit) {
      return NextResponse.json({ error: "Pursuit not found" }, { status: 404 });
    }

    return NextResponse.json(pursuit);
  } catch (error) {
    console.error("GET /api/auto-pursuits/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch auto pursuit" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      `UPDATE auto_pursuits SET
        brand = $1,
        model = $2,
        year_min = $3,
        year_max = $4,
        body_style = $5,
        color = $6,
        mileage_max = $7,
        price_min = $8,
        price_max = $9,
        sources = $10::text[],
        facebook_location = $11,
        exclude_terms = $12,
        notes = $13,
        status = $14,
        updated_at = NOW()
       WHERE id = $15 AND user_id = $16
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
        params.id,
        session.user.id,
      ]
    );

    if (!pursuit) {
      return NextResponse.json({ error: "Pursuit not found" }, { status: 404 });
    }

    return NextResponse.json(pursuit);
  } catch (error) {
    console.error("PATCH /api/auto-pursuits/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update auto pursuit" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const deleted = await queryOne<AutoPursuit>(
      `DELETE FROM auto_pursuits WHERE id = $1 AND user_id = $2 RETURNING *`,
      [params.id, session.user.id]
    );

    if (!deleted) {
      return NextResponse.json({ error: "Pursuit not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/auto-pursuits/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete auto pursuit" },
      { status: 500 }
    );
  }
}
