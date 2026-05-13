import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { issueTokens } from "@/lib/api-tokens";
import { isAdminEmail } from "@/lib/admin";
import { verifyIdToken } from "@/lib/social-verify";

// POST /api/auth/social
//   { provider: 'apple'|'google', idToken, displayName?, client? }
//     -> { access, accessExpiresAt, refresh, refreshExpiresAt, user }
//
// Native social sign-in. The client (iOS) runs the platform Sign-in flow
// locally and forwards the resulting ID token here. We verify it against
// the provider's JWKS, find-or-create the local user, link the
// `accounts` row, and issue our own Bearer tokens.
//
// Audiences are configured by environment:
//   - VAULT1_APPLE_AUDIENCES  comma-separated (bundle id(s) + Services ID)
//   - VAULT1_GOOGLE_AUDIENCES comma-separated (iOS + Web client IDs)
// Falls back to existing NextAuth provider env vars when the new ones
// aren't set (APPLE_ID for Apple, GOOGLE_CLIENT_ID for Google web).
//
// `displayName` is an optional name forwarded by the client. Apple only
// returns the user's real name on the very first sign-in (as a form-post
// field, NOT inside the id_token), so the iOS client must capture it
// once and pass it here.

interface Body {
  provider?: "apple" | "google";
  idToken?: string;
  displayName?: string;
  client?: string;
}

function audiencesFor(provider: "apple" | "google"): string[] {
  if (provider === "apple") {
    const raw = process.env.VAULT1_APPLE_AUDIENCES || process.env.APPLE_ID || "";
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const raw = process.env.VAULT1_GOOGLE_AUDIENCES || process.env.GOOGLE_CLIENT_ID || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.provider !== "apple" && body.provider !== "google") {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }
  if (!body.idToken) {
    return NextResponse.json({ error: "idToken required" }, { status: 400 });
  }

  const expectedAudiences = audiencesFor(body.provider);
  if (expectedAudiences.length === 0) {
    return NextResponse.json({ error: "Social sign-in not configured" }, { status: 503 });
  }

  let identity;
  try {
    identity = await verifyIdToken({
      provider: body.provider,
      idToken: body.idToken,
      expectedAudiences,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid ID token", detail: err instanceof Error ? err.message : "unknown" },
      { status: 401 }
    );
  }

  if (!identity.email) {
    // Apple "Hide my email" routes through a private-relay address; the
    // claim is still present unless the user manually omitted email scope.
    // If genuinely missing we can't link to a user — fail cleanly.
    return NextResponse.json({ error: "Provider did not return an email" }, { status: 400 });
  }

  // Find-or-create user (case-insensitive email match).
  const lowered = identity.email.toLowerCase();
  let user = await queryOne<{ id: string; email: string; name: string | null; image: string | null }>(
    "SELECT id, email, name, image FROM users WHERE LOWER(email) = $1",
    [lowered]
  );

  if (!user) {
    const created = await queryOne<{ id: string; email: string; name: string | null; image: string | null }>(
      `INSERT INTO users (email, name, email_verified)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, image`,
      [identity.email, body.displayName ?? identity.name ?? null, identity.emailVerified ? new Date() : null]
    );
    if (!created) return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    user = created;
    // First-OAuth-user data claim mirrors the web sign-in flow (lib/auth.ts).
    // See the CLAUDE.md note: "Disable claimOrphanedData before opening signups."
    await query(`UPDATE guitar_items   SET user_id = $1 WHERE user_id IS NULL`, [user.id]).catch(() => {});
    await query(`UPDATE watch_items    SET user_id = $1 WHERE user_id IS NULL`, [user.id]).catch(() => {});
    await query(`UPDATE automobiles    SET user_id = $1 WHERE user_id IS NULL`, [user.id]).catch(() => {});
    await query(`UPDATE items_of_distinction SET user_id = $1 WHERE user_id IS NULL`, [user.id]).catch(() => {});
  } else if (body.displayName && !user.name) {
    await query("UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2", [body.displayName, user.id]).catch(() => {});
    user.name = body.displayName;
  }

  // Link the account row idempotently — matches the shape lib/auth.ts uses.
  await query(
    `INSERT INTO accounts (user_id, type, provider, provider_account_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_account_id) DO NOTHING`,
    [user.id, "oauth", body.provider, identity.sub]
  ).catch(() => {});

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
