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

export const config = {
  matcher: ["/((?!login|register|api/auth|api/pursuits/run-search|_next/static|_next/image|favicon\\.ico|uploads).*)"],
};
