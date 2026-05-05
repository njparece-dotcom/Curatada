import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { WatchCategory, WatchItem } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { category } = body as { category: WatchCategory };

    const validCategories = [
      "luxury-watches",
      "sport-watches",
      "dress-watches",
      "vintage-watches",
    ];
    if (!category || !validCategories.includes(category)) {
      return NextResponse.json({ error: "Valid category is required" }, { status: 400 });
    }

    const items = await query<WatchItem>(
      `SELECT * FROM watch_items WHERE category = $1 AND user_id = $2 ORDER BY created_at DESC`,
      [category, session.user.id]
    );

    if (items.length === 0) {
      return NextResponse.json({ valued: 0, failed: 0, items: [] });
    }

    const results: { id: string; name: string; price?: number; error?: string }[] = [];
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`;
    const cookie = request.headers.get("cookie") ?? "";

    for (const item of items) {
      try {
        const res = await fetch(`${baseUrl}/api/watches/${item.id}/value`, {
          method: "POST",
          headers: { cookie },
        });

        if (!res.ok) {
          const err = await res.json();
          results.push({
            id: item.id,
            name: `${item.brand} ${item.model}`,
            error: err.error || "Valuation failed",
          });
        } else {
          const data = await res.json();
          results.push({
            id: item.id,
            name: `${item.brand} ${item.model}`,
            price: data.suggested_price,
          });
        }
      } catch (err) {
        results.push({
          id: item.id,
          name: `${item.brand} ${item.model}`,
          error: String(err),
        });
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }

    const valued = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error).length;

    return NextResponse.json({ valued, failed, items: results });
  } catch (error) {
    console.error("POST /api/watches/value-batch error:", error);
    return NextResponse.json({ error: "Batch valuation failed" }, { status: 500 });
  }
}
