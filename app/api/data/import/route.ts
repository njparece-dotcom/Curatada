import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

// ── Valid enum values ─────────────────────────────────────────────────────────

const GUITAR_CATEGORIES  = ["electric-guitars", "acoustic-guitars", "amplifiers", "pedals"];
const WATCH_CATEGORIES   = ["luxury-watches", "sport-watches", "dress-watches", "pocket-vintage"];
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
  if (row.purchase_price != null && typeof row.purchase_price !== "number")
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
  if (row.purchase_price != null && typeof row.purchase_price !== "number")
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
  if (row.mileage != null && typeof row.mileage !== "number")
    errs.push({ row: idx, field: "mileage", message: "Must be a number" });
  if (row.purchase_price != null && typeof row.purchase_price !== "number")
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
  if (row.purchase_price != null && typeof row.purchase_price !== "number")
    errs.push({ row: idx, field: "purchase_price", message: "Must be a number" });
  return errs;
}

// ── Per-collection inserters (ON CONFLICT id → DO NOTHING = skip duplicates) ─

async function insertGuitar(r: Record<string, unknown>, userId: string) {
  await query(
    `INSERT INTO guitar_items (id, user_id, category, brand, model, year, serial_number, condition, purchase_price, purchase_source, color_finish, short_description, link, notes)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO NOTHING`,
    [r.id||null, userId, normalizeSlug(r.category), r.brand, r.model, r.year||null, r.serial_number||null,
     normalizeCondition(r.condition)||"Good", r.purchase_price||null, r.purchase_source||null,
     r.color_finish||null, r.short_description||null, r.link||null, r.notes||null]
  );
}

async function insertWatch(r: Record<string, unknown>, userId: string) {
  await query(
    `INSERT INTO watch_items (id, user_id, category, brand, model, year, reference_number, case_diameter, serial_number, condition, purchase_price, purchase_source, dial_color, country_of_manufacture, movement, bracelet_material, case_material, short_description, link, notes)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     ON CONFLICT (id) DO NOTHING`,
    [r.id||null, userId, normalizeSlug(r.category), r.brand, r.model, r.year||null, r.reference_number||null,
     r.case_diameter||null, r.serial_number||null, normalizeCondition(r.condition)||"Good", r.purchase_price||null,
     r.purchase_source||null, r.dial_color||null,
     r.country_of_manufacture||null, r.movement||null, r.bracelet_material||null,
     r.case_material||null, r.short_description||null, r.link||null, r.notes||null]
  );
}

async function insertAuto(r: Record<string, unknown>, userId: string) {
  await query(
    `INSERT INTO automobiles (id, user_id, category, brand, model, year, description, trim_level, engine, transmission, mileage, condition, body_style, color, vin, purchase_price, purchase_date, purchase_source, notes)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (id) DO NOTHING`,
    [r.id||null, userId, normalizeSlug(r.category), r.brand, r.model, r.year||null, r.description||null,
     r.trim_level||null, r.engine||null, r.transmission||null, r.mileage||null,
     normalizeCondition(r.condition)||null, r.body_style||null, r.color||null, r.vin||null,
     r.purchase_price||null, r.purchase_date||null, r.purchase_source||null, r.notes||null]
  );
}

async function insertIoD(r: Record<string, unknown>, userId: string) {
  await query(
    `INSERT INTO items_of_distinction (id, user_id, category, item_type, brand, short_description, long_description, year, condition, purchase_price, purchase_date, purchase_source, provenance, notes)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO NOTHING`,
    [r.id||null, userId, normalizeSlug(r.category), r.item_type||null, r.brand||null, r.short_description,
     r.long_description||null, r.year||null, normalizeCondition(r.condition)||null, r.purchase_price||null,
     r.purchase_date||null, r.purchase_source||null, r.provenance||null, r.notes||null]
  );
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  console.log("[import POST] session userId:", session?.user?.id ?? "NONE");
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const body = await req.json();
    console.log("[import POST] collections keys:", Object.keys(body?.collections ?? {}));

    // Structural check
    if (!body || body.version !== "1.0" || !body.collections || typeof body.collections !== "object") {
      return NextResponse.json(
        { error: "Invalid file format. Expected a Curatada export with version '1.0'." },
        { status: 400 }
      );
    }

    const cols = body.collections as Record<string, unknown[]>;
    const results: Record<string, { imported: number; skipped: number; errors: ValidationError[] }> = {};

    const run = async (
      key: string,
      validator: (r: Record<string, unknown>, i: number) => ValidationError[],
      inserter: (r: Record<string, unknown>, uid: string) => Promise<void>
    ) => {
      if (!cols[key]) return;
      if (!Array.isArray(cols[key])) {
        results[key] = { imported: 0, skipped: 0, errors: [{ row: 0, field: key, message: "Must be an array" }] };
        return;
      }
      let imported = 0, skipped = 0;
      const errors: ValidationError[] = [];
      for (let i = 0; i < cols[key].length; i++) {
        const row = cols[key][i] as Record<string, unknown>;
        const rowErrs = validator(row, i + 1);
        if (rowErrs.length > 0) {
          errors.push(...rowErrs);
          skipped++;
          continue;
        }
        try {
          await inserter(row, userId);
          imported++;
        } catch (e) {
          errors.push({ row: i + 1, field: "db", message: String(e) });
          skipped++;
        }
      }
      results[key] = { imported, skipped, errors };
    };

    await run("guitars",      validateGuitar, insertGuitar);
    await run("watches",      validateWatch,  insertWatch);
    await run("automobiles",  validateAuto,   insertAuto);
    await run("collectibles", validateIoD,    insertIoD);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[import]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Also expose a validate-only endpoint (dry run)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    if (!body || body.version !== "1.0" || !body.collections || typeof body.collections !== "object") {
      return NextResponse.json(
        { error: "Invalid file format. Expected a Curatada export with version '1.0'." },
        { status: 400 }
      );
    }

    const cols = body.collections as Record<string, unknown[]>;
    const results: Record<string, { count: number; errors: ValidationError[] }> = {};

    const validate = (
      key: string,
      validator: (r: Record<string, unknown>, i: number) => ValidationError[]
    ) => {
      if (!cols[key]) return;
      if (!Array.isArray(cols[key])) {
        results[key] = { count: 0, errors: [{ row: 0, field: key, message: "Must be an array" }] };
        return;
      }
      const errors: ValidationError[] = [];
      for (let i = 0; i < cols[key].length; i++) {
        const rowErrs = validator(cols[key][i] as Record<string, unknown>, i + 1);
        errors.push(...rowErrs);
      }
      results[key] = { count: cols[key].length, errors };
    };

    validate("guitars",      validateGuitar);
    validate("watches",      validateWatch);
    validate("automobiles",  validateAuto);
    validate("collectibles", validateIoD);

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
