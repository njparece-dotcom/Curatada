import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { IoDPursuit } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pursuits = await query<IoDPursuit>(
      `SELECT * FROM iod_pursuits WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.user.id]
    );
    return NextResponse.json(pursuits);
  } catch (error) {
    console.error("GET /api/iod-pursuits error:", error);
    return NextResponse.json(
      { error: "Failed to fetch IoD pursuits" },
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
      `INSERT INTO iod_pursuits
        (item_type, brand, description, price_min, price_max, sources, exclude_terms, notes, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10)
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
        session.user.id,
      ]
    );

    if (!pursuit) {
      throw new Error("Failed to create pursuit");
    }

    return NextResponse.json(pursuit, { status: 201 });
  } catch (error) {
    console.error("POST /api/iod-pursuits error:", error);
    return NextResponse.json(
      { error: "Failed to create IoD pursuit" },
      { status: 500 }
    );
  }
}
