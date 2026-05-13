import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { query, queryOne } from "@/lib/db";

// JWT signing key is reused from NEXTAUTH_SECRET — same trust boundary as the
// NextAuth session cookie. Claims are namespaced (`iss: vault1-api`, `aud:
// vault1-client`) so a confused-deputy slip can't swap them. If we ever need
// to rotate independently of NextAuth, introduce VAULT1_API_JWT_SECRET and
// prefer it here.
const SECRET = () => {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(s);
};

const ISS = "vault1-api";
const AUD = "vault1-client";

const ACCESS_TTL_SECONDS = 15 * 60;             // 15 minutes
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;  // 30 days

export interface AccessClaims {
  sub: string;        // user id
  email: string;
  name: string | null;
  isAdmin: boolean;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISS)
    .setAudience(AUD)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(SECRET());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, SECRET(), { issuer: ISS, audience: AUD });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("invalid token payload");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: (payload.name as string | null) ?? null,
    isAdmin: payload.isAdmin === true,
  };
}

// Refresh tokens are opaque random secrets, NOT JWTs. The wire format is
// `<row-id>.<secret>`; the row-id lets us look up the record in O(1) and the
// secret is checked with a constant-time compare against the stored
// SHA-256 hash. Storing only the hash means a DB leak alone doesn't yield
// usable refresh tokens.
function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export interface IssuedTokens {
  access: string;
  accessExpiresAt: number;   // unix seconds
  refresh: string;
  refreshExpiresAt: number;  // unix seconds
}

interface IssueOpts {
  userId: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  client?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  replaces?: string | null;  // refresh-token row id being rotated
}

export async function issueTokens(opts: IssueOpts): Promise<IssuedTokens> {
  const access = await signAccessToken({
    sub: opts.userId,
    email: opts.email,
    name: opts.name,
    isAdmin: opts.isAdmin,
  });
  const now = Math.floor(Date.now() / 1000);

  const secret = crypto.randomBytes(48).toString("base64url");
  const tokenHash = sha256(secret);
  const expiresAt = new Date((now + REFRESH_TTL_SECONDS) * 1000);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, client, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [opts.userId, tokenHash, opts.client ?? null, opts.userAgent ?? null, opts.ip ?? null, expiresAt]
  );
  if (!row) throw new Error("failed to persist refresh token");

  if (opts.replaces) {
    await query(
      `UPDATE refresh_tokens
         SET revoked_at = NOW(), replaced_by = $1
       WHERE id = $2 AND revoked_at IS NULL`,
      [row.id, opts.replaces]
    );
  }

  return {
    access,
    accessExpiresAt: now + ACCESS_TTL_SECONDS,
    refresh: `${row.id}.${secret}`,
    refreshExpiresAt: now + REFRESH_TTL_SECONDS,
  };
}

interface RefreshRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
}

// Returns the row to be rotated, or `null` if the token is unknown/expired.
// Reuse of an already-revoked token is a strong signal of theft — caller
// should treat that as a hard failure and revoke the entire chain.
export async function consumeRefreshToken(presented: string): Promise<
  | { kind: "ok"; rowId: string; userId: string }
  | { kind: "reuse"; rowId: string; userId: string }
  | { kind: "invalid" }
> {
  const dot = presented.indexOf(".");
  if (dot < 0) return { kind: "invalid" };
  const id = presented.slice(0, dot);
  const secret = presented.slice(dot + 1);
  if (!id || !secret) return { kind: "invalid" };

  const row = await queryOne<RefreshRow>(
    `SELECT id, user_id, token_hash, expires_at, revoked_at FROM refresh_tokens WHERE id = $1`,
    [id]
  );
  if (!row) return { kind: "invalid" };

  const presentedHash = sha256(secret);
  const a = Buffer.from(presentedHash, "hex");
  const b = Buffer.from(row.token_hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { kind: "invalid" };

  if (row.revoked_at) return { kind: "reuse", rowId: row.id, userId: row.user_id };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { kind: "invalid" };

  await query(`UPDATE refresh_tokens SET last_used_at = NOW() WHERE id = $1`, [row.id]);
  return { kind: "ok", rowId: row.id, userId: row.user_id };
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

export async function revokeRefreshToken(rowId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
    [rowId]
  );
}
