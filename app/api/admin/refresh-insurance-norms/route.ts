// Admin endpoint: refresh per-(module, category) insurance multipliers in
// `insurance_valuation_norms` via Anthropic web_search. Story CUR-4.
//
// Auth model (per the PRD's resolved Open Question #1 at CUR-4 start):
//   NextAuth session + email allowlist. Simple, no new env var, and matches
//   how `claimOrphanedData` in lib/auth.ts already keys admin-ish behaviour
//   off a known email. Extend ADMIN_EMAILS when more admins land.
//
// Body shape:
//   { module: "guitars" | "watches" | "automobiles" | "iod", category?: string }
//   - If `category` is omitted, refreshes ALL categories for the module.
//   - If `category` is provided, refreshes just that one (still costs 1
//     Anthropic call — the prompt asks for one entry).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  researchInsuranceNorms,
  upsertInsuranceNorms,
  MODULE_CATEGORIES,
  type ModuleSlug,
} from "@/lib/insurance-valuation";

// Extend this list when more team members need to run admin actions. Today
// it's just the lone Curatada dev. A future migration to a `users.is_admin`
// column is a clean upgrade path.
const ADMIN_EMAILS: readonly string[] = ["nick@nextideaup.com"];

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

const VALID_MODULES: ModuleSlug[] = ["guitars", "watches", "automobiles", "iod"];

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { module?: string; category?: string };
  try {
    body = (await request.json()) as { module?: string; category?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const moduleSlug = body.module as ModuleSlug | undefined;
  if (!moduleSlug || !VALID_MODULES.includes(moduleSlug)) {
    return NextResponse.json(
      { error: `module must be one of: ${VALID_MODULES.join(", ")}` },
      { status: 400 },
    );
  }

  const categories =
    body.category != null && body.category.length > 0
      ? [body.category]
      : Array.from(MODULE_CATEGORIES[moduleSlug]);

  try {
    const researched = await researchInsuranceNorms(moduleSlug, categories);
    if (researched.length > 0) {
      await upsertInsuranceNorms(moduleSlug, researched);
    }
    return NextResponse.json({
      module: moduleSlug,
      requested: categories,
      upserted: researched.length,
      norms: researched,
    });
  } catch (err) {
    console.error(`[admin/refresh-insurance-norms] error module=${moduleSlug}`, err);
    return NextResponse.json(
      { error: "Failed to refresh insurance norms; see server logs for detail" },
      { status: 500 },
    );
  }
}
