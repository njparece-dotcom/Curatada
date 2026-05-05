import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { GuitarCategory, Condition } from "@/lib/types";

const VALID_CATEGORIES: GuitarCategory[] = [
  "electric-guitars",
  "acoustic-guitars",
  "amplifiers",
  "pedals",
];

const VALID_CONDITIONS: Condition[] = [
  "Mint",
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Poor",
];

interface ImportRow {
  category: string;
  brand: string;
  model: string;
  year?: string | number | null;
  serial_number?: string | null;
  condition: string;
  purchase_price?: string | number | null;
  purchase_source?: string | null;
  color_finish?: string | null;
  short_description?: string | null;
  link?: string | null;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await request.json();
    const { rows } = body as { rows: ImportRow[] };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    const results: { index: number; success: boolean; error?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        if (!row.brand?.toString().trim()) throw new Error("Brand is required");
        if (!row.model?.toString().trim()) throw new Error("Model is required");
        if (!VALID_CATEGORIES.includes(row.category as GuitarCategory)) {
          throw new Error(`Invalid category: "${row.category}"`);
        }
        if (!VALID_CONDITIONS.includes(row.condition as Condition)) {
          throw new Error(`Invalid condition: "${row.condition}". Must be one of: ${VALID_CONDITIONS.join(", ")}`);
        }

        const year = row.year ? parseInt(String(row.year)) : null;
        if (row.year && (isNaN(year!) || year! < 1800 || year! > new Date().getFullYear() + 1)) {
          throw new Error(`Invalid year: "${row.year}"`);
        }

        const price = row.purchase_price
          ? parseFloat(String(row.purchase_price).replace(/[$,]/g, ""))
          : null;
        if (row.purchase_price && (isNaN(price!) || price! < 0)) {
          throw new Error(`Invalid purchase price: "${row.purchase_price}"`);
        }

        const link = row.link?.toString().trim() || null;
        if (link && !/^https?:\/\/.+/.test(link)) {
          throw new Error(`Invalid link URL: "${link}"`);
        }

        await query(
          `INSERT INTO guitar_items
            (user_id, category, brand, model, year, serial_number, condition, purchase_price,
             purchase_source, color_finish, short_description, link, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            userId,
            row.category,
            row.brand.toString().trim(),
            row.model.toString().trim(),
            year,
            row.serial_number?.toString().trim() || null,
            row.condition,
            price,
            row.purchase_source?.toString().trim() || null,
            row.color_finish?.toString().trim() || null,
            row.short_description?.toString().trim() || null,
            link,
            row.notes?.toString().trim() || null,
          ]
        );

        results.push({ index: i, success: true });
      } catch (err) {
        results.push({ index: i, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const imported = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ imported, failed, results });
  } catch (error) {
    console.error("POST /api/guitars/import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
