import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { consumeRefreshToken, issueTokens, revokeAllForUser } from "@/lib/api-tokens";
import { isAdminEmail } from "@/lib/admin";

// POST /api/auth/refresh
//   { refresh } -> { access, accessExpiresAt, refresh, refreshExpiresAt, user }
//
// Rotates the refresh token on every call. If a token that was already
// revoked is presented, this is treated as theft: every active refresh
// token for that user is revoked and the call returns 401. The native
// client must then prompt re-authentication.

interface Body {
  refresh?: string;
  client?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.refresh) {
    return NextResponse.json({ error: "Refresh token required" }, { status: 400 });
  }

  const verdict = await consumeRefreshToken(body.refresh);
  if (verdict.kind === "invalid") {
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
  }
  if (verdict.kind === "reuse") {
    // Already-revoked token replayed — invalidate every active refresh for
    // this user. The legitimate client will rotate to the new token on its
    // next successful call; if both are reaching here, the user has been
    // compromised and must reauth.
    await revokeAllForUser(verdict.userId);
    return NextResponse.json({ error: "Refresh token reuse detected" }, { status: 401 });
  }

  const user = await queryOne<{ id: string; email: string; name: string | null; image: string | null }>(
    "SELECT id, email, name, image FROM users WHERE id = $1",
    [verdict.userId]
  );
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const tokens = await issueTokens({
    userId: user.id,
    email: user.email,
    name: user.name,
    isAdmin: isAdminEmail(user.email),
    client: body.client ?? null,
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for") || null,
    replaces: verdict.rowId,
  });

  return NextResponse.json({
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      isAdmin: isAdminEmail(user.email),
    },
  });
}
