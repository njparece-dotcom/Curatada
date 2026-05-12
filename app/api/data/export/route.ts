import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

// Embed every item's full valuation history alongside the item so an
// import re-creates the dashboard's "latest price" and the user's prior
// AI valuations (which cost money to regenerate). Image rows are
// deliberately not exported — the underlying files live on local disk
// per the active deploy and can't roundtrip until object storage is in.

interface Row { id: string; [key: string]: unknown; }

async function withValuations(
  items: Row[],
  valuationsTable: string,
  fkColumn: string,
): Promise<Row[]> {
  if (items.length === 0) return items;
  const ids = items.map((i) => i.id);
  const valuations = await query<Row>(
    `SELECT * FROM ${valuationsTable}
     WHERE ${fkColumn} = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [ids],
  );
  const byItem = new Map<string, Row[]>();
  for (const v of valuations) {
    const itemId = v[fkColumn] as string;
    const list = byItem.get(itemId) ?? [];
    list.push(v);
    byItem.set(itemId, list);
  }
  return items.map((i) => ({ ...i, valuations: byItem.get(i.id) ?? [] }));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const { collections } = (await req.json()) as { collections: string[] };

    const result: Record<string, unknown[]> = {};

    if (collections.includes("guitars")) {
      const items = await query<Row>(
        `SELECT * FROM guitar_items WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      result.guitars = await withValuations(items, "guitar_valuations", "guitar_item_id");
    }

    if (collections.includes("watches")) {
      const items = await query<Row>(
        `SELECT * FROM watch_items WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      result.watches = await withValuations(items, "watch_valuations", "watch_item_id");
    }

    if (collections.includes("automobiles")) {
      const items = await query<Row>(
        `SELECT * FROM automobiles WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      result.automobiles = await withValuations(items, "auto_valuations", "auto_id");
    }

    if (collections.includes("collectibles")) {
      const items = await query<Row>(
        `SELECT * FROM items_of_distinction WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      result.collectibles = await withValuations(items, "iod_valuations", "iod_id");
    }

    // CUR-9: include insurance_valuation_norms as a top-level export key so
    // a roundtrip rehydrates a fresh DB with the same norm table (saving
    // the ~$1 + a minute of Anthropic calls to re-research). Config-level,
    // not user-scoped — these multipliers apply to every user.
    //
    // paperwork_generations is NOT exported (history-only, regenerable).
    const insuranceValuationNorms = await query<Row>(
      `SELECT module, category, multiplier::float AS multiplier, notes, updated_at
         FROM insurance_valuation_norms
         ORDER BY module, category`,
      [],
    );

    const payload = {
      // Bumped to 1.1 to signal the new fields (insurance/archive cols on
      // every item, plus the new insurance_valuation_norms top-level key).
      // The importer accepts both 1.0 and 1.1 — older payloads default
      // insure=false, archived_at=null.
      version: "1.1",
      exported_at: new Date().toISOString(),
      collections: result,
      insurance_valuation_norms: insuranceValuationNorms,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[export]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
