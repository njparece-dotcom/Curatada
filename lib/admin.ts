// Admin role check. v1: env-var allowlist (`ADMIN_EMAILS`, comma-separated).
//
// Why an env var and not a DB column on `users.is_admin`:
// — Vault 1 is a personal app today; the admin set is "me". Provisioning via
//   `railway variables set ADMIN_EMAILS=...` is one step and survives a
//   user-table wipe.
// — A DB column means an admin-management UI (not worth building yet) or
//   manual SQL (`UPDATE users SET is_admin=true ...`) per environment.
// — When the time comes (multi-tenant, multiple admins, role hierarchy) the
//   migration is straightforward: add a column, backfill from the env var
//   list, switch `isAdminEmail` to query the DB.
//
// Called from two places:
//   - `lib/auth.ts` JWT/session callbacks — stamps `session.user.isAdmin` at
//     login so client components can gate UI without a server round-trip.
//   - `app/api/admin/**` route handlers — authoritative check on every
//     request. The session stamp is a UX hint; the route is the gate.

import type { Session } from "next-auth";

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.size === 0) return false;
  return admins.has(email.toLowerCase());
}

export function isAdmin(session: Session | null | undefined): boolean {
  return isAdminEmail(session?.user?.email ?? null);
}
