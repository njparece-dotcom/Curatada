import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { WatchPursuit } from "@/lib/types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pursuits = await query<WatchPursuit>(
      `SELECT * FROM watch_pursuits WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.user.id]
    );
    return NextResponse.json(pursuits);
  } catch (error) {
    console.error("GET /api/watch-pursuits error:", error);
    return NextResponse.json({ error: "Failed to fetch watch pursuits" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const { brand,model,reference_number,case_diameter,dial_color,materials,price_min,price_max,sources,facebook_location,other_source,exclude_terms,notes,status } = body;
    const pursuit = await queryOne<WatchPursuit>(
      `INSERT INTO watch_pursuits
        (brand,model,reference_number,case_diameter,dial_color,materials,price_min,price_max,sources,facebook_location,other_source,exclude_terms,notes,status,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12,$13,$14,$15) RETURNING *`,
      [brand||null,model||null,reference_number||null,case_diameter||null,dial_color||null,materials||null,
       price_min||null,price_max||null,Array.isArray(sources)?sources:[],
       facebook_location||null,other_source||null,exclude_terms||null,notes||null,status||"active",session.user.id]
    );
    if (!pursuit) throw new Error("Failed to create pursuit");
    return NextResponse.json(pursuit, { status: 201 });
  } catch (error) {
    console.error("POST /api/watch-pursuits error:", error);
    return NextResponse.json({ error: "Failed to create watch pursuit" }, { status: 500 });
  }
}
