import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { GuitarPursuit } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pursuit = await queryOne<GuitarPursuit>(
      `SELECT * FROM guitar_pursuits WHERE id = $1 AND user_id = $2`, [params.id, session.user.id]
    );
    if (!pursuit) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(pursuit);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { brand,model,year_min,year_max,color_finish,price_min,price_max,sources,facebook_location,exclude_terms,notes,status } = await request.json();
    const pursuit = await queryOne<GuitarPursuit>(
      `UPDATE guitar_pursuits SET brand=$1,model=$2,year_min=$3,year_max=$4,color_finish=$5,
       price_min=$6,price_max=$7,sources=$8::text[],facebook_location=$9,exclude_terms=$10,
       notes=$11,status=$12,updated_at=NOW() WHERE id=$13 AND user_id=$14 RETURNING *`,
      [brand||null,model||null,year_min||null,year_max||null,color_finish||null,
       price_min||null,price_max||null,Array.isArray(sources)?sources:[],
       facebook_location||null,exclude_terms||null,notes||null,status||"active",params.id,session.user.id]
    );
    if (!pursuit) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(pursuit);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const deleted = await queryOne(`DELETE FROM guitar_pursuits WHERE id=$1 AND user_id=$2 RETURNING id`, [params.id, session.user.id]);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
