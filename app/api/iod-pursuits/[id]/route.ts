import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { IoDPursuit } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const pursuit = await queryOne<IoDPursuit>(
      `SELECT * FROM iod_pursuits WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!pursuit) {
      return NextResponse.json({ error: "Pursuit not found" }, { status: 404 });
    }

    return NextResponse.json(pursuit);
  } catch (error) {
    console.error("GET /api/iod-pursuits/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch IoD pursuit" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      item_type,
      brand,
      description,
      price_min,
      price_max,
      sources,
      exclude_terms,
      notes,
      status,
    } = body;

    const pursuit = await queryOne<IoDPursuit>(
      `UPDATE iod_pursuits SET
        item_type = $1,
        brand = $2,
        description = $3,
        price_min = $4,
        price_max = $5,
        sources = $6::text[],
        exclude_terms = $7,
        notes = $8,
        status = $9,
        updated_at = NOW()
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [
        item_type || null,
        brand || null,
        description || null,
        price_min || null,
        price_max || null,
        sources && Array.isArray(sources) ? sources : [],
        exclude_terms || null,
        notes || null,
        status || "active",
        id,
        session.user.id,
      ]
    );

    if (!pursuit) {
      return NextResponse.json({ error: "Pursuit not found" }, { status: 404 });
    }

    return NextResponse.json(pursuit);
  } catch (error) {
    console.error("PATCH /api/iod-pursuits/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update IoD pursuit" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const deleted = await queryOne<IoDPursuit>(
      `DELETE FROM iod_pursuits WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, session.user.id]
    );

    if (!deleted) {
      return NextResponse.json({ error: "Pursuit not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/iod-pursuits/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete IoD pursuit" },
      { status: 500 }
    );
  }
}
