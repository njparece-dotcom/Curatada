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
export const config = {
  matcher: ["/((?!login|register|api/auth|api/pursuits/run-search|api/mgmt|api/upload|_next/static|_next/image|favicon\\.ico|uploads).*)"],
};
