import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await query<{ module: string; enabled: boolean }>(
    "SELECT module, enabled FROM user_modules WHERE user_id = $1",
    [session.user.id]
  );
  // If no rows, user hasn't set up modules yet → null signals "needs setup"
  if (rows.length === 0) return NextResponse.json(null);
  const modules: Record<string, boolean> = {};
  for (const r of rows) modules[r.module] = r.enabled;
  return NextResponse.json(modules);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { modules } = await req.json() as { modules: Record<string, boolean> };
  const ALL = ["guitars", "watches", "automobiles", "collectibles"];
  for (const mod of ALL) {
    await query(
      "INSERT INTO user_modules (user_id, module, enabled) VALUES ($1, $2, $3) ON CONFLICT (user_id, module) DO UPDATE SET enabled = EXCLUDED.enabled",
      [session.user.id, mod, modules[mod] ?? false]
    );
  }
  return NextResponse.json({ success: true });
}
