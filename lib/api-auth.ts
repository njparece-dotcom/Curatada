import type { NextRequest } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAccessToken } from "@/lib/api-tokens";

// Unified session lookup for any API route that wants to accept both
// the web app's NextAuth session cookie AND the iOS app's Bearer access
// token. Existing routes can be migrated incrementally — call
// `getApiSession(req)` instead of `getServerSession(authOptions)`.
//
// Returns the same shape as `getServerSession`, with `user.id` filled in
// (NextAuth's default `Session.user` type doesn't include `id`; the
// project-wide augmentation in next-auth callbacks already adds it).
export interface ApiSession {
  user: {
    id: string;
    email: string;
    name: string | null;
    image?: string | null;
    isAdmin?: boolean;
  };
}

export async function getApiSession(req: NextRequest | Request): Promise<ApiSession | null> {
  // Try Bearer first — cheap (stateless verify, no DB) and gives the iOS
  // client the same priority order as the web client.
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token.length > 0) {
      try {
        const claims = await verifyAccessToken(token);
        return {
          user: {
            id: claims.sub,
            email: claims.email,
            name: claims.name,
            isAdmin: claims.isAdmin === true,
          },
        };
      } catch {
        // Invalid/expired token — fall through to NextAuth cookie. A 401 is
        // only correct if the route requires auth; let the route decide.
      }
    }
  }

  const session = (await getServerSession(authOptions)) as Session | null;
  if (!session?.user) return null;
  const u = session.user as { id?: string; email?: string | null; name?: string | null; image?: string | null; isAdmin?: boolean };
  if (!u.id || !u.email) return null;
  return {
    user: {
      id: u.id,
      email: u.email,
      name: u.name ?? null,
      image: u.image ?? null,
      isAdmin: u.isAdmin === true,
    },
  };
}
