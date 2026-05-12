import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      // Stamped by the JWT/session callbacks in lib/auth.ts from the
      // ADMIN_EMAILS env-var allowlist (see lib/admin.ts). Client UI uses
      // this to gate the admin nav link; server routes must NOT trust it
      // — they recompute via isAdmin(session) on every request.
      isAdmin?: boolean;
    };
  }
  interface User {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    isAdmin?: boolean;
  }
}
