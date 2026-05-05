import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { AutoCategory, Condition } from "@/lib/types";

const VALID_CATEGORIES: AutoCategory[] = ["collection", "household"];

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
  description?: string | null;
  trim_level?: string | null;
  engine?: string | null;
  transmission?: string | null;
  mileage?: string | number | null;
  condition: string;
  body_style?: string | null;
  color?: string | null;
  vin?: string | null;
  purchase_price?: string | number | null;
  purchase_date?: string | null;
  purchase_source?: string | null;
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
        if (!VALID_CATEGORIES.includes(row.category as AutoCategory)) {
          throw new Error(`Invalid category: "${row.category}". Must be one of: ${VALID_CATEGORIES.join(", ")}`);
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

        const mileage = row.mileage
          ? parseFloat(String(row.mileage).replace(/[,]/g, ""))
          : null;
        if (row.mileage && (isNaN(mileage!) || mileage! < 0)) {
          throw new Error(`Invalid mileage: "${row.mileage}"`);
        }

        await query(
          `INSERT INTO automobiles
            (user_id, category, brand, model, year, description, trim_level, engine,
             transmission, mileage, condition, body_style, color, vin,
             purchase_price, purchase_date, purchase_source, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            userId,
            row.category,
            row.brand.toString().trim(),
            row.model.toString().trim(),
            year,
            row.description?.toString().trim() || null,
            row.trim_level?.toString().trim() || null,
            row.engine?.toString().trim() || null,
            row.transmission?.toString().trim() || null,
            mileage,
            row.condition,
            row.body_style?.toString().trim() || null,
            row.color?.toString().trim() || null,
            row.vin?.toString().trim() || null,
            price,
            row.purchase_date?.toString().trim() || null,
            row.purchase_source?.toString().trim() || null,
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
    console.error("POST /api/automobiles/import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
