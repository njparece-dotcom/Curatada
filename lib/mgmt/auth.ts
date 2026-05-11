// Auth gate for /api/mgmt/v1/* routes.
//
// Per the playbook contract, defence-in-depth:
//   1. Network gate (optional): if MGMT_REQUIRE_INTERNAL=1, reject any
//      request whose x-forwarded-for header is set, i.e. anything that came
//      through Railway's public edge. Pairs with private-network calls via
//      <service>.railway.internal.
//   2. Bearer token: Authorization: Bearer <MGMT_API_TOKEN>. Constant-time
//      compare so timing attacks can't probe the token byte-by-byte.
//   3. Rate limit: 60/min per caller IP (see ./rateLimit).
//
// The network gate runs first because it's cheaper — a probe from the
// public edge can't even time the token comparison.
//
// If MGMT_API_TOKEN is not configured, every route returns 503 so a deploy
// that forgets to set it can't accidentally expose data.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { rateLimitAllow } from "./rateLimit";
import { errorResponse } from "./envelope";

export interface MgmtAuthResult {
  /** Caller key for rate-limit accounting; only set when allowed. */
  callerKey: string;
}

/**
 * Verifies the mgmt-API auth on a request. Returns a NextResponse to send
 * (caller should `return` it) when auth fails or the rate limit fires.
 * Returns `{ callerKey }` when the request is allowed to proceed.
 */
export function authorizeMgmtRequest(
  request: NextRequest,
): NextResponse | MgmtAuthResult {
  const configured = process.env.MGMT_API_TOKEN;
  if (!configured) {
    // Never throw / never leak — just refuse all calls.
    return errorResponse("Management API is not configured on this deploy.", 503);
  }

  // 1. Internal-only gate (cheaper than the token compare, so it runs first).
  if (process.env.MGMT_REQUIRE_INTERNAL === "1") {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
      return errorResponse("Forbidden — internal-only", 403);
    }
  }

  // 2. Bearer token (constant-time).
  const header = request.headers.get("authorization") ?? "";
  const expectedPrefix = "Bearer ";
  if (!header.startsWith(expectedPrefix)) {
    return errorResponse("Unauthorized", 401);
  }
  const presented = header.slice(expectedPrefix.length);
  if (!constantTimeStringEqual(presented, configured)) {
    return errorResponse("Unauthorized", 401);
  }

  // 3. Rate limit, keyed by source IP (or token suffix if no IP visible).
  // x-forwarded-for is "client, proxy1, proxy2..." — the first entry is the
  // original client. Falls back to a stable token-derived bucket so internal
  // callers (no XFF) still share a budget.
  const xff = request.headers.get("x-forwarded-for");
  const callerKey = xff ? xff.split(",")[0].trim() : "internal";
  if (!rateLimitAllow(callerKey)) {
    return errorResponse("Rate limit exceeded (60/min)", 429);
  }

  return { callerKey };
}

// Constant-time string compare. Different-length strings are short-circuited
// to a constant-time path so length difference itself isn't a leak (we
// compare against a constant-length buffer of the same size as the expected
// value).
function constantTimeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still run a compare against bb of bb's length so the timing of the
    // mismatch path doesn't reveal which side was longer.
    timingSafeEqual(Buffer.alloc(bb.length, 0), bb);
    return false;
  }
  return timingSafeEqual(ab, bb);
}
