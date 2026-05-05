import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const { collections } = await req.json() as { collections: string[] };

    const result: Record<string, unknown[]> = {};

    if (collections.includes("guitars")) {
      result.guitars = await query(
        `SELECT gi.*,
          (SELECT price FROM guitar_valuations WHERE guitar_item_id = gi.id AND valuation_type = 'ai'   ORDER BY created_at DESC LIMIT 1) AS latest_ai_price,
          (SELECT price FROM guitar_valuations WHERE guitar_item_id = gi.id AND valuation_type = 'user' ORDER BY created_at DESC LIMIT 1) AS latest_user_price
         FROM guitar_items gi WHERE gi.user_id = $1 ORDER BY gi.created_at`,
        [userId]
      );
    }

    if (collections.includes("watches")) {
      result.watches = await query(
        `SELECT wi.*,
          (SELECT price FROM watch_valuations WHERE watch_item_id = wi.id AND valuation_type = 'ai'   ORDER BY created_at DESC LIMIT 1) AS latest_ai_price,
          (SELECT price FROM watch_valuations WHERE watch_item_id = wi.id AND valuation_type = 'user' ORDER BY created_at DESC LIMIT 1) AS latest_user_price
         FROM watch_items wi WHERE wi.user_id = $1 ORDER BY wi.created_at`,
        [userId]
      );
    }

    if (collections.includes("automobiles")) {
      result.automobiles = await query(
        `SELECT a.*,
          (SELECT price FROM auto_valuations WHERE auto_id = a.id AND valuation_type = 'ai'   ORDER BY created_at DESC LIMIT 1) AS latest_ai_price,
          (SELECT price FROM auto_valuations WHERE auto_id = a.id AND valuation_type = 'user' ORDER BY created_at DESC LIMIT 1) AS latest_user_price
         FROM automobiles a WHERE a.user_id = $1 ORDER BY a.created_at`,
        [userId]
      );
    }

    if (collections.includes("collectibles")) {
      result.collectibles = await query(
        `SELECT i.*,
          (SELECT price FROM iod_valuations WHERE iod_id = i.id AND valuation_type = 'ai'   ORDER BY created_at DESC LIMIT 1) AS latest_ai_price,
          (SELECT price FROM iod_valuations WHERE iod_id = i.id AND valuation_type = 'user' ORDER BY created_at DESC LIMIT 1) AS latest_user_price
         FROM items_of_distinction i WHERE i.user_id = $1 ORDER BY i.created_at`,
        [userId]
      );
    }

    const payload = {
      version: "1.0",
      exported_at: new Date().toISOString(),
      collections: result,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[export]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
