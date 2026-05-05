import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { WatchPursuit } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pursuit = await queryOne<WatchPursuit>(
      `SELECT * FROM watch_pursuits WHERE id = $1 AND user_id = $2`, [params.id, session.user.id]
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
    const { brand,model,reference_number,case_diameter,dial_color,materials,price_min,price_max,sources,facebook_location,other_source,exclude_terms,notes,status } = await request.json();
    const pursuit = await queryOne<WatchPursuit>(
      `UPDATE watch_pursuits SET brand=$1,model=$2,reference_number=$3,case_diameter=$4,dial_color=$5,
       materials=$6,price_min=$7,price_max=$8,sources=$9::text[],facebook_location=$10,other_source=$11,
       exclude_terms=$12,notes=$13,status=$14,updated_at=NOW() WHERE id=$15 AND user_id=$16 RETURNING *`,
      [brand||null,model||null,reference_number||null,case_diameter||null,dial_color||null,materials||null,
       price_min||null,price_max||null,Array.isArray(sources)?sources:[],
       facebook_location||null,other_source||null,exclude_terms||null,notes||null,status||"active",params.id,session.user.id]
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
    const deleted = await queryOne(`DELETE FROM watch_pursuits WHERE id=$1 AND user_id=$2 RETURNING id`, [params.id, session.user.id]);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
