import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { WatchPursuit } from "@/lib/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action } = await request.json() as { action: "snooze" | "dismiss" | "deactivate" };

    let pursuit: WatchPursuit | null = null;

    if (action === "snooze") {
      pursuit = await queryOne<WatchPursuit>(
        `UPDATE watch_pursuits
         SET checkin_snoozed_until = NOW() + INTERVAL '30 days'
         WHERE id = $1 RETURNING *`,
        [id]
      );
    } else if (action === "dismiss") {
      pursuit = await queryOne<WatchPursuit>(
        `UPDATE watch_pursuits
         SET checkin_dismissed = TRUE
         WHERE id = $1 RETURNING *`,
        [id]
      );
    } else if (action === "deactivate") {
      pursuit = await queryOne<WatchPursuit>(
        `UPDATE watch_pursuits
         SET status = 'paused'
         WHERE id = $1 RETURNING *`,
        [id]
      );
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (!pursuit) {
      return NextResponse.json({ error: "Pursuit not found" }, { status: 404 });
    }

    return NextResponse.json(pursuit);
  } catch (error) {
    console.error("POST /api/watch-pursuits/[id]/checkin error:", error);
    return NextResponse.json({ error: "Failed to update pursuit" }, { status: 500 });
  }
}
