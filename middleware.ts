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
export const config = {
  matcher: ["/((?!login|register|api/auth|api/pursuits/run-search|api/mgmt|api/upload|api/data/import|_next/static|_next/image|favicon\\.ico|uploads).*)"],
};
