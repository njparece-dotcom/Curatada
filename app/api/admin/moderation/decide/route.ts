// POST /api/admin/moderation/decide
//
// Admin action: approve or block a single image. Body:
//   { module: "guitars"|"watches"|"automobiles"|"iod",
//     image_id: <uuid>,
//     decision: "approve"|"block" }
//
// The decision maps to the moderation_status column:
//   approve → 'approved'   (cleared for public exposure when galleries land)
//   block   → 'blocked'    (withheld from public surfaces; file stays in
//                          storage until a separate purge action is built)
//
// We intentionally do NOT delete the image row or its R2 object on 'block'.
// Reasons:
//   1. Reversibility — an admin who clicks Block on the wrong row needs to
//      be able to undo it. Hidden-but-recoverable is the right default.
//   2. The parent item still owns this image. Deleting the row would orphan
//      the user's sort_order/is_primary state.
//   3. A future "purge blocked images" cron can sweep the R2 objects in
//      bulk once we're confident no false-positives are still in review.
//
// Auth: admin-only. Same allowlist as the queue endpoint.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { queryOne } from "@/lib/db";
import { getModuleSpec } from "@/lib/moderation/queue";

const DECISIONS = { approve: "approved", block: "blocked" } as const;
type Decision = keyof typeof DECISIONS;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { module?: unknown; image_id?: unknown; decision?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const decision = body.decision as Decision | undefined;
    if (decision !== "approve" && decision !== "block") {
      return NextResponse.json(
        { error: "decision must be 'approve' or 'block'" },
        { status: 400 },
      );
    }

    const moduleSlug = typeof body.module === "string" ? body.module : "";
    const spec = getModuleSpec(moduleSlug);
    if (!spec) {
      return NextResponse.json({ error: "Unknown module" }, { status: 400 });
    }

    const imageId = typeof body.image_id === "string" ? body.image_id : "";
    if (!imageId) {
      return NextResponse.json(
        { error: "image_id is required" },
        { status: 400 },
      );
    }

    const newStatus = DECISIONS[decision];

    // The UPDATE returns the row so the client can refresh its local state
    // without a second round trip. We don't filter by user_id here — admin
    // moderation crosses user boundaries by design.
    const updated = await queryOne<{ id: string; moderation_status: string }>(
      `UPDATE ${spec.imagesTable}
         SET moderation_status = $1
       WHERE id = $2
       RETURNING id, moderation_status`,
      [newStatus, imageId],
    );

    if (!updated) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    return NextResponse.json({
      module: spec.module,
      image_id: updated.id,
      moderation_status: updated.moderation_status,
    });
  } catch (error) {
    console.error("POST /api/admin/moderation/decide error:", error);
    return NextResponse.json(
      { error: "Failed to record moderation decision" },
      { status: 500 },
    );
  }
}
