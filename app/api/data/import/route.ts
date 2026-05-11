import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

// ── Valid enum values ─────────────────────────────────────────────────────────

const GUITAR_CATEGORIES  = ["electric-guitars", "acoustic-guitars", "amplifiers", "pedals"];
const WATCH_CATEGORIES   = ["luxury-watches", "sport-watches", "dress-watches", "vintage-watches"];
const AUTO_CATEGORIES    = ["collection", "household"];
const IOD_CATEGORIES     = ["fine-art", "memorabilia", "collectibles", "jewelry", "other"];
const CONDITIONS         = ["Mint", "Excellent", "Very Good", "Good", "Fair", "Poor"];

// Normalize a category string to slug form: lowercase, spaces→hyphens
function normalizeSlug(v: unknown): string {
  if (!v || typeof v !== "string") return "";
  return v.trim().toLowerCase().replace(/\s+/g, "-");
}
// Normalize condition: title-case first word
function normalizeCondition(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const t = v.trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// NUMERIC columns come back from pg as strings (JS Number can't represent
// arbitrary precision decimals). The validator + inserter both have to
// accept "4200.00" as well as 4200. Returns null for null/empty/unparseable
// so the column gets a real NULL on insert.
function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isNumericInput(v: unknown): boolean {
  return v == null || v === "" || toNumber(v) !== null;
}

// ── Per-collection validators ─────────────────────────────────────────────────

interface ValidationError { row: number; field: string; message: string; }

function validateGuitar(row: Record<string, unknown>, idx: number): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!row.brand || typeof row.brand !== "string") errs.push({ row: idx, field: "brand", message: "Required string" });
  if (!row.model || typeof row.model !== "string") errs.push({ row: idx, field: "model", message: "Required string" });
  if (!row.category || !GUITAR_CATEGORIES.includes(normalizeSlug(row.category)))
    errs.push({ row: idx, field: "category", message: `Must be one of: ${GUITAR_CATEGORIES.join(", ")}` });
  if (row.condition != null && !CONDITIONS.includes(normalizeCondition(row.condition) ?? ""))
    errs.push({ row: idx, field: "condition", message: `Must be one of: ${CONDITIONS.join(", ")}` });
  if (row.year != null && (typeof row.year !== "number" || !Number.isInteger(row.year)))
    errs.push({ row: idx, field: "year", message: "Must be an integer" });
  if (!isNumericInput(row.purchase_price))
    errs.push({ row: idx, field: "purchase_price", message: "Must be a number" });
  return errs;
}

function validateWatch(row: Record<string, unknown>, idx: number): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!row.brand || typeof row.brand !== "string") errs.push({ row: idx, field: "brand", message: "Required string" });
  if (!row.model || typeof row.model !== "string") errs.push({ row: idx, field: "model", message: "Required string" });
  if (!row.category || !WATCH_CATEGORIES.includes(normalizeSlug(row.category)))
    errs.push({ row: idx, field: "category", message: `Must be one of: ${WATCH_CATEGORIES.join(", ")}` });
  if (row.condition != null && !CONDITIONS.includes(normalizeCondition(row.condition) ?? ""))
    errs.push({ row: idx, field: "condition", message: `Must be one of: ${CONDITIONS.join(", ")}` });
  if (row.year != null && (typeof row.year !== "number" || !Number.isInteger(row.year)))
    errs.push({ row: idx, field: "year", message: "Must be an integer" });
  if (!isNumericInput(row.purchase_price))
    errs.push({ row: idx, field: "purchase_price", message: "Must be a number" });
  return errs;
}

function validateAuto(row: Record<string, unknown>, idx: number): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!row.brand || typeof row.brand !== "string") errs.push({ row: idx, field: "brand", message: "Required string" });
  if (!row.model || typeof row.model !== "string") errs.push({ row: idx, field: "model", message: "Required string" });
  if (!row.category || !AUTO_CATEGORIES.includes(normalizeSlug(row.category)))
    errs.push({ row: idx, field: "category", message: `Must be one of: ${AUTO_CATEGORIES.join(", ")}` });
  if (row.condition != null && !CONDITIONS.includes(normalizeCondition(row.condition) ?? ""))
    errs.push({ row: idx, field: "condition", message: `Must be one of: ${CONDITIONS.join(", ")}` });
  if (row.year != null && (typeof row.year !== "number" || !Number.isInteger(row.year)))
    errs.push({ row: idx, field: "year", message: "Must be an integer" });
  if (row.mileage != null && (typeof row.mileage !== "number" || !Number.isInteger(row.mileage)))
    errs.push({ row: idx, field: "mileage", message: "Must be an integer" });
  if (!isNumericInput(row.purchase_price))
    errs.push({ row: idx, field: "purchase_price", message: "Must be a number" });
  return errs;
}

function validateIoD(row: Record<string, unknown>, idx: number): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!row.short_description || typeof row.short_description !== "string")
    errs.push({ row: idx, field: "short_description", message: "Required string" });
  if (!row.category || !IOD_CATEGORIES.includes(normalizeSlug(row.category)))
    errs.push({ row: idx, field: "category", message: `Must be one of: ${IOD_CATEGORIES.join(", ")}` });
  if (row.condition != null && !CONDITIONS.includes(normalizeCondition(row.condition) ?? ""))
    errs.push({ row: idx, field: "condition", message: `Must be one of: ${CONDITIONS.join(", ")}` });
  if (row.year != null && (typeof row.year !== "number" || !Number.isInteger(row.year)))
    errs.push({ row: idx, field: "year", message: "Must be an integer" });
  if (!isNumericInput(row.purchase_price))
    errs.push({ row: idx, field: "purchase_price", message: "Must be a number" });
  return errs;
}

// ── Per-collection inserters ──────────────────────────────────────────────────
//
// Each returns the resolved item id (preserved from the export, or freshly
// generated) when a row was actually inserted. Returns null on ON CONFLICT
// (i.e. the item already existed) so the caller knows whether to also import
// the embedded valuations. Preserving created_at keeps timeline order
// intact after a local → hosted move.

async function insertGuitar(r: Record<string, unknown>, userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO guitar_items
      (id, user_id, category, brand, model, year, serial_number, condition,
       purchase_price, purchase_source, color_finish, short_description,
       link, notes, created_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15::timestamptz, NOW()))
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [r.id || null, userId, normalizeSlug(r.category), r.brand, r.model, r.year || null, r.serial_number || null,
     normalizeCondition(r.condition) || "Good", toNumber(r.purchase_price), r.purchase_source || null,
     r.color_finish || null, r.short_description || null, r.link || null, r.notes || null, r.created_at || null],
  );
  return result[0]?.id ?? null;
}

async function insertWatch(r: Record<string, unknown>, userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO watch_items
      (id, user_id, category, brand, model, year, reference_number, case_diameter,
       serial_number, condition, purchase_price, purchase_source, dial_color,
       country_of_manufacture, movement, bracelet_material, case_material,
       short_description, link, notes, created_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, COALESCE($21::timestamptz, NOW()))
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [r.id || null, userId, normalizeSlug(r.category), r.brand, r.model, r.year || null, r.reference_number || null,
     r.case_diameter || null, r.serial_number || null, normalizeCondition(r.condition) || "Good", toNumber(r.purchase_price),
     r.purchase_source || null, r.dial_color || null,
     r.country_of_manufacture || null, r.movement || null, r.bracelet_material || null,
     r.case_material || null, r.short_description || null, r.link || null, r.notes || null, r.created_at || null],
  );
  return result[0]?.id ?? null;
}

async function insertAuto(r: Record<string, unknown>, userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO automobiles
      (id, user_id, category, brand, model, year, description, trim_level, engine,
       transmission, mileage, condition, body_style, color, vin, purchase_price,
       purchase_date, purchase_source, notes, created_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, COALESCE($20::timestamptz, NOW()))
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [r.id || null, userId, normalizeSlug(r.category), r.brand, r.model, r.year || null, r.description || null,
     r.trim_level || null, r.engine || null, r.transmission || null, r.mileage || null,
     normalizeCondition(r.condition) || null, r.body_style || null, r.color || null, r.vin || null,
     toNumber(r.purchase_price), r.purchase_date || null, r.purchase_source || null, r.notes || null, r.created_at || null],
  );
  return result[0]?.id ?? null;
}

async function insertIoD(r: Record<string, unknown>, userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO items_of_distinction
      (id, user_id, category, item_type, brand, short_description, long_description,
       year, condition, purchase_price, purchase_date, purchase_source, provenance,
       notes, created_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15::timestamptz, NOW()))
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [r.id || null, userId, normalizeSlug(r.category), r.item_type || null, r.brand || null, r.short_description,
     r.long_description || null, r.year || null, normalizeCondition(r.condition) || null, toNumber(r.purchase_price),
     r.purchase_date || null, r.purchase_source || null, r.provenance || null, r.notes || null, r.created_at || null],
  );
  return result[0]?.id ?? null;
}

// ── Valuations import ─────────────────────────────────────────────────────────
//
// Embedded under each item as `valuations: [...]` by the exporter. Same
// schema across all four modules; only the table + FK column name differs.

async function insertValuations(
  table: string,
  fkColumn: string,
  itemId: string,
  rows: unknown,
): Promise<number> {
  if (!Array.isArray(rows)) return 0;
  let inserted = 0;
  for (const v of rows) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const price = toNumber(r.price);
    if (!r.valuation_type || price == null) continue;
    if (r.valuation_type !== "ai" && r.valuation_type !== "user") continue;
    await query(
      `INSERT INTO ${table} (id, ${fkColumn}, valuation_type, price, notes, comparable_sales, created_at)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, NOW()))
       ON CONFLICT (id) DO NOTHING`,
      [
        r.id || null,
        itemId,
        r.valuation_type,
        price,
        r.notes || null,
        r.comparable_sales ? JSON.stringify(r.comparable_sales) : null,
        r.created_at || null,
      ],
    );
    inserted++;
  }
  return inserted;
}

// ── Route ─────────────────────────────────────────────────────────────────────

interface CollectionRun {
  key: string;
  validator: (r: Record<string, unknown>, i: number) => ValidationError[];
  inserter: (r: Record<string, unknown>, uid: string) => Promise<string | null>;
  valuationsTable: string;
  valuationsFk: string;
}

const RUNS: CollectionRun[] = [
  { key: "guitars",      validator: validateGuitar, inserter: insertGuitar, valuationsTable: "guitar_valuations", valuationsFk: "guitar_item_id" },
  { key: "watches",      validator: validateWatch,  inserter: insertWatch,  valuationsTable: "watch_valuations",  valuationsFk: "watch_item_id"  },
  { key: "automobiles",  validator: validateAuto,   inserter: insertAuto,   valuationsTable: "auto_valuations",   valuationsFk: "auto_id"        },
  { key: "collectibles", validator: validateIoD,    inserter: insertIoD,    valuationsTable: "iod_valuations",    valuationsFk: "iod_id"         },
];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  console.log("[import POST] session userId:", session?.user?.id ?? "NONE");
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const body = await req.json();
    console.log("[import POST] collections keys:", Object.keys(body?.collections ?? {}));

    if (!body || body.version !== "1.0" || !body.collections || typeof body.collections !== "object") {
      return NextResponse.json(
        { error: "Invalid file format. Expected a Curatada export with version '1.0'." },
        { status: 400 },
      );
    }

    const cols = body.collections as Record<string, unknown[]>;
    const results: Record<string, { imported: number; skipped: number; valuations_imported: number; errors: ValidationError[] }> = {};

    for (const r of RUNS) {
      if (!cols[r.key]) continue;
      if (!Array.isArray(cols[r.key])) {
        results[r.key] = { imported: 0, skipped: 0, valuations_imported: 0, errors: [{ row: 0, field: r.key, message: "Must be an array" }] };
        continue;
      }
      let imported = 0, skipped = 0, valuationsImported = 0;
      const errors: ValidationError[] = [];
      for (let i = 0; i < cols[r.key].length; i++) {
        const row = cols[r.key][i] as Record<string, unknown>;
        const rowErrs = r.validator(row, i + 1);
        if (rowErrs.length > 0) {
          errors.push(...rowErrs);
          skipped++;
          continue;
        }
        try {
          const newId = await r.inserter(row, userId);
          if (newId) {
            imported++;
            valuationsImported += await insertValuations(r.valuationsTable, r.valuationsFk, newId, row.valuations);
          } else {
            // ON CONFLICT — item already existed; don't touch valuations either
            skipped++;
          }
        } catch (e) {
          errors.push({ row: i + 1, field: "db", message: String(e) });
          skipped++;
        }
      }
      results[r.key] = { imported, skipped, valuations_imported: valuationsImported, errors };
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[import]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Validate-only endpoint (dry run).
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    if (!body || body.version !== "1.0" || !body.collections || typeof body.collections !== "object") {
      return NextResponse.json(
        { error: "Invalid file format. Expected a Curatada export with version '1.0'." },
        { status: 400 },
      );
    }

    const cols = body.collections as Record<string, unknown[]>;
    const results: Record<string, { count: number; errors: ValidationError[] }> = {};

    for (const r of RUNS) {
      if (!cols[r.key]) continue;
      if (!Array.isArray(cols[r.key])) {
        results[r.key] = { count: 0, errors: [{ row: 0, field: r.key, message: "Must be an array" }] };
        continue;
      }
      const errors: ValidationError[] = [];
      for (let i = 0; i < cols[r.key].length; i++) {
        const rowErrs = r.validator(cols[r.key][i] as Record<string, unknown>, i + 1);
        errors.push(...rowErrs);
      }
      results[r.key] = { count: cols[r.key].length, errors };
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
