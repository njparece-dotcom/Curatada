import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getApiSession } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";

// GET /api/status
//   Header: Authorization: Bearer <access>     (or NextAuth session cookie)
//   -> { user: { id, email, name, image, isAdmin } }
//
// Lightweight session probe used by the iOS client on cold launch
// (TokenStore.hasTokens -> /api/status -> show dashboard or login).
//
// Excluded from the NextAuth middleware matcher so the Bearer path can
// reach it without a cookie.

export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Bearer claims are stale once the user updates their profile; pull a
  // fresh image/name from the DB so the client doesn't show outdated data.
  const fresh = await queryOne<{ id: string; email: string; name: string | null; image: string | null }>(
    "SELECT id, email, name, image FROM users WHERE id = $1",
    [session.user.id]
  );
  if (!fresh) return NextResponse.json({ error: "User not found" }, { status: 401 });

  return NextResponse.json({
    user: {
      id: fresh.id,
      email: fresh.email,
      name: fresh.name,
      image: fresh.image,
      isAdmin: isAdminEmail(fresh.email),
    },
  });
}
