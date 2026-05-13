import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { queryOne, query } from "@/lib/db";
import { issueTokens } from "@/lib/api-tokens";
import { isAdminEmail } from "@/lib/admin";

// POST /api/auth/token
//   { email, password, client? } -> { access, accessExpiresAt, refresh, refreshExpiresAt, user }
//
// Native-client login. Mirrors the NextAuth Credentials provider's bcrypt
// verification, then issues a Bearer access (15m) + opaque refresh (30d).
//
// This route is excluded from the NextAuth middleware matcher (see
// middleware.ts) so unauthenticated requests can reach it.

interface Body {
  email?: string;
  password?: string;
  client?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await queryOne<{ id: string; email: string; name: string | null; image: string | null; password_hash: string | null }>(
    "SELECT id, email, name, image, password_hash FROM users WHERE email = $1",
    [email]
  );
  if (!user || !user.password_hash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]).catch(() => {});

  const tokens = await issueTokens({
    userId: user.id,
    email: user.email,
    name: user.name,
    isAdmin: isAdminEmail(user.email),
    client: body.client ?? null,
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for") || null,
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
