import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/login",
    },
  }
);

// `api/upload` (singular, the POST endpoint) is excluded so multi-file
// FormData bodies aren't truncated by Next's middleware buffer (default
// 10MB). The route does its own getServerSession() check, so dropping
// middleware here doesn't widen the auth surface. The same alternative
// also (coincidentally, as a regex prefix match) excludes `api/uploads`
// (image-serving GET); image serving doesn't need NextAuth either.
//
// `api/data/import` is also excluded for the same body-size reason: v1.2
// exports with `include_image_data: true` can run to hundreds of MB
// (base64-encoded image bytes inline). The route does its own session
// check via getServerSession(authOptions).
//
// `api/status` is excluded because it's the Bearer-auth probe used by the
// native client — its own handler resolves either Bearer or cookie via
// `lib/api-auth.ts`. (`api/auth` was already excluded for NextAuth's own
// flow; the new /api/auth/token, /refresh, /social routes are covered by
// that same prefix match.)
//
// `api/aasa` + the `.well-known/apple-app-site-association` public path
// are excluded so Apple's CDN can fetch the AASA file without going
// through NextAuth's redirect. The route is unauthenticated by design
// and returns a static JSON body.
export const config = {
  matcher: ["/((?!login|register|api/auth|api/status|api/aasa|\\.well-known|api/pursuits/run-search|api/mgmt|api/upload|api/data/import|_next/static|_next/image|favicon\\.ico|uploads).*)"],
};
