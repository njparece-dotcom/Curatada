import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface PursuitFinding {
  id: string; pursuit_id: string; source: string; title: string | null;
  url: string; price: number | null; condition: string | null; location: string | null;
  days_listed: number | null; listed_at: string | null; image_url: string | null;
  first_seen_at: string; last_seen_at: string;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");

  const rows = await query<PursuitFinding>(
    `SELECT pf.id, pf.pursuit_id, pf.source, pf.title, pf.url, pf.price, pf.condition,
            pf.location, pf.days_listed, pf.listed_at, pf.image_url, pf.first_seen_at, pf.last_seen_at
     FROM pursuit_findings pf
     JOIN watch_pursuits wp ON wp.id = pf.pursuit_id AND wp.user_id = $1
     WHERE pf.pursuit_type = 'watch'
       ${id ? "AND pf.pursuit_id = $2" : ""}
     ORDER BY pf.price ASC NULLS LAST, pf.first_seen_at DESC`,
    id ? [session.user.id, id] : [session.user.id]
  );

  const grouped: Record<string, PursuitFinding[]> = {};
  for (const row of rows) {
    if (!grouped[row.pursuit_id]) grouped[row.pursuit_id] = [];
    grouped[row.pursuit_id].push(row);
  }
  return NextResponse.json(grouped);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing ?id param" }, { status: 400 });

  await query(
    `DELETE FROM pursuit_findings WHERE pursuit_type = 'watch' AND pursuit_id = $1
     AND pursuit_id IN (SELECT id FROM watch_pursuits WHERE user_id = $2)`,
    [id, session.user.id]
  );
  return NextResponse.json({ ok: true });
}
