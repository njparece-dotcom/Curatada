// Generic CRUD handler factory for the four collection modules. Each module's
// route.ts and [id]/route.ts call makeListHandlers / makeItemHandlers with
// their CollectionConfig — the per-module differences live entirely in those
// configs.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";
import fs from "fs/promises";
import { authOptions } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import type { CollectionConfig, FieldSpec } from "@/lib/collections/types";

const VALID_CONDITIONS = ["Mint", "Excellent", "Very Good", "Good", "Fair", "Poor"] as const;

interface ImagePath {
  filename: string;
  original_name: string | null;
  path: string;
  mime_type?: string | null;
  size?: number | null;
}

// ── SQL fragment builders ─────────────────────────────────────────────────────

function imagesJsonAgg(c: CollectionConfig): string {
  return `COALESCE(
    json_agg(
      json_build_object(
        'id', img.id,
        '${c.imageFkColumn}', img.${c.imageFkColumn},
        'filename', img.filename,
        'original_name', img.original_name,
        'path', img.path,
        'mime_type', img.mime_type,
        'size', img.size,
        'is_primary', img.is_primary,
        'sort_order', img.sort_order,
        'created_at', img.created_at
      ) ORDER BY img.sort_order ASC, img.is_primary DESC, img.created_at ASC
    ) FILTER (WHERE img.id IS NOT NULL),
    '[]'::json
  ) AS images`;
}

// withValuations=true emits LATERAL joins to the valuations table for the
// list-GET response. POST/PATCH responses use withValuations=false (returning
// NULL placeholders) — this matches existing behaviour: a freshly-created or
// updated item has no inline valuation data attached.
function listSelectSql(c: CollectionConfig, withValuations: boolean): string {
  const valSelect = withValuations
    ? `,
    MAX(ai_val.price) AS latest_ai_price,
    MAX(ai_val.created_at) AS latest_ai_price_date,
    MAX(user_val.price) AS latest_user_price,
    MAX(user_val.created_at) AS latest_user_price_date`
    : `,
    NULL::numeric AS latest_ai_price,
    NULL::timestamptz AS latest_ai_price_date,
    NULL::numeric AS latest_user_price,
    NULL::timestamptz AS latest_user_price_date`;

  const valJoins = withValuations
    ? `
    LEFT JOIN LATERAL (
      SELECT price, created_at FROM ${c.valuationsTable}
      WHERE ${c.valuationFkColumn} = ${c.alias}.id AND valuation_type = 'ai'
      ORDER BY created_at DESC LIMIT 1
    ) ai_val ON true
    LEFT JOIN LATERAL (
      SELECT price, created_at FROM ${c.valuationsTable}
      WHERE ${c.valuationFkColumn} = ${c.alias}.id AND valuation_type = 'user'
      ORDER BY created_at DESC LIMIT 1
    ) user_val ON true`
    : "";

  return `SELECT ${c.alias}.*,
    ${imagesJsonAgg(c)}${valSelect}
   FROM ${c.table} ${c.alias}
   LEFT JOIN ${c.imagesTable} img ON img.${c.imageFkColumn} = ${c.alias}.id${valJoins}`;
}

// ── Body normalisation + validation ───────────────────────────────────────────

function normalizeField(value: unknown, spec: FieldSpec): unknown {
  if (value == null) return null;
  if (spec.trim && typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  // Mirrors the legacy `value || null` behaviour: empty strings, 0, and false
  // become null. Acceptable for these schemas (no boolean/zero numeric fields).
  return (value as unknown) || null;
}

function validateBody(
  body: Record<string, unknown>,
  c: CollectionConfig,
  isCreate: boolean
): string | null {
  if (isCreate) {
    if (!body.category || typeof body.category !== "string") return "category is required";
    if (!c.validCategories.includes(body.category)) return "Invalid category";
  } else if (body.category != null && body.category !== "") {
    if (!c.validCategories.includes(body.category as string)) return "Invalid category";
  }

  for (const f of c.fields) {
    if (!f.required) continue;
    const v = body[f.name];
    if (v == null) return `${f.name} is required`;
    if (typeof v === "string" && f.trim && !v.trim()) return `${f.name} is required`;
    if (f.name === "condition" && !VALID_CONDITIONS.includes(v as typeof VALID_CONDITIONS[number])) {
      return "Invalid condition";
    }
  }

  // condition is optional on this module (autos, iod) but still must be valid
  // if provided.
  if (!c.conditionRequired) {
    const cond = body.condition;
    if (
      cond != null &&
      cond !== "" &&
      !VALID_CONDITIONS.includes(cond as typeof VALID_CONDITIONS[number])
    ) {
      return "Invalid condition";
    }
  }

  return null;
}

// ── Image side-effects ────────────────────────────────────────────────────────

async function deleteImageFiles(images: { filename: string }[]): Promise<void> {
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  for (const image of images) {
    try {
      await fs.unlink(path.join(uploadsDir, image.filename));
    } catch {
      // file may already be gone; nothing to do
    }
  }
}

async function insertImagePaths(
  c: CollectionConfig,
  itemId: string,
  imagePaths: ImagePath[],
  startIndex: number,
  hasExisting: boolean
): Promise<void> {
  for (let i = 0; i < imagePaths.length; i++) {
    const img = imagePaths[i];
    await query(
      `INSERT INTO ${c.imagesTable} (${c.imageFkColumn}, filename, original_name, path, mime_type, size, is_primary, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        itemId,
        img.filename,
        img.original_name,
        img.path,
        img.mime_type ?? null,
        img.size ?? null,
        !hasExisting && i === 0,
        startIndex + i,
      ]
    );
  }
}

// ── Public factories ──────────────────────────────────────────────────────────

export function makeListHandlers(c: CollectionConfig) {
  async function GET(request: NextRequest) {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const category = new URL(request.url).searchParams.get("category");

      const params: unknown[] = [session.user.id];
      let sql = `${listSelectSql(c, true)}
        WHERE ${c.alias}.user_id = $1`;
      if (category) {
        sql += ` AND ${c.alias}.category = $2`;
        params.push(category);
      }
      sql += ` GROUP BY ${c.alias}.id ORDER BY ${c.alias}.created_at DESC`;

      const items = await query(sql, params);
      return NextResponse.json(items);
    } catch (error) {
      console.error(`GET /api/${c.label} list error:`, error);
      return NextResponse.json(
        { error: `Failed to fetch ${c.label} items` },
        { status: 500 }
      );
    }
  }

  async function POST(request: NextRequest) {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const body = (await request.json()) as Record<string, unknown>;
      const validationError = validateBody(body, c, true);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const columns = ["category", ...c.fields.map((f) => f.name), "user_id"];
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const values: unknown[] = [
        body.category,
        ...c.fields.map((f) => normalizeField(body[f.name], f)),
        session.user.id,
      ];

      const item = await queryOne<{ id: string }>(
        `INSERT INTO ${c.table} (${columns.join(", ")})
         VALUES (${placeholders})
         RETURNING *`,
        values
      );
      if (!item) throw new Error(`Failed to create ${c.label} item`);

      const imagePaths = body.image_paths;
      if (Array.isArray(imagePaths) && imagePaths.length > 0) {
        await insertImagePaths(c, item.id, imagePaths as ImagePath[], 0, false);
      }

      const fullItem = await queryOne(
        `${listSelectSql(c, false)}
         WHERE ${c.alias}.id = $1
         GROUP BY ${c.alias}.id`,
        [item.id]
      );

      return NextResponse.json(fullItem, { status: 201 });
    } catch (error) {
      console.error(`POST /api/${c.label} error:`, error);
      return NextResponse.json(
        { error: `Failed to create ${c.label} item` },
        { status: 500 }
      );
    }
  }

  return { GET, POST };
}

export function makeItemHandlers(c: CollectionConfig) {
  async function GET(
    _request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const item = await queryOne(
        `${listSelectSql(c, false)}
         WHERE ${c.alias}.id = $1 AND ${c.alias}.user_id = $2
         GROUP BY ${c.alias}.id`,
        [params.id, session.user.id]
      );
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      return NextResponse.json(item);
    } catch (error) {
      console.error(`GET /api/${c.label}/[id] error:`, error);
      return NextResponse.json(
        { error: `Failed to fetch ${c.label} item` },
        { status: 500 }
      );
    }
  }

  async function DELETE(
    _request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Read filenames before the cascade removes the rows so we can clean
      // them off disk after the parent delete commits.
      const images = await query<{ filename: string }>(
        `SELECT filename FROM ${c.imagesTable} WHERE ${c.imageFkColumn} = $1`,
        [params.id]
      );

      const deleted = await queryOne(
        `DELETE FROM ${c.table} WHERE id = $1 AND user_id = $2 RETURNING *`,
        [params.id, session.user.id]
      );
      if (!deleted) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      await deleteImageFiles(images);
      return NextResponse.json({ success: true, deleted });
    } catch (error) {
      console.error(`DELETE /api/${c.label}/[id] error:`, error);
      return NextResponse.json(
        { error: `Failed to delete ${c.label} item` },
        { status: 500 }
      );
    }
  }

  async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const body = (await request.json()) as Record<string, unknown>;
      const validationError = validateBody(body, c, false);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      // Build the SET clause: category uses COALESCE so it is preserved if the
      // PATCH body omits it; the rest of the configured fields overwrite.
      const setClauses: string[] = ["category = COALESCE($1, category)"];
      const values: unknown[] = [body.category || null];
      let nextPlaceholder = 2;
      for (const f of c.fields) {
        setClauses.push(`${f.name} = $${nextPlaceholder}`);
        values.push(normalizeField(body[f.name], f));
        nextPlaceholder++;
      }
      if (c.patchSetUpdatedAt) {
        setClauses.push("updated_at = NOW()");
      }
      const idPlaceholder = nextPlaceholder;
      const userIdPlaceholder = nextPlaceholder + 1;
      values.push(params.id, session.user.id);

      const item = await queryOne(
        `UPDATE ${c.table} SET ${setClauses.join(", ")}
         WHERE id = $${idPlaceholder} AND user_id = $${userIdPlaceholder}
         RETURNING *`,
        values
      );
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      // Reorder existing images.
      const imageOrder = body.image_order;
      if (Array.isArray(imageOrder) && imageOrder.length > 0) {
        for (let i = 0; i < imageOrder.length; i++) {
          await query(
            `UPDATE ${c.imagesTable} SET sort_order = $1, is_primary = $2
             WHERE id = $3 AND ${c.imageFkColumn} = $4`,
            [i, i === 0, imageOrder[i], params.id]
          );
        }
      }

      // Delete removed images (DB rows + files on disk).
      const imagesToDelete = body.images_to_delete;
      if (Array.isArray(imagesToDelete) && imagesToDelete.length > 0) {
        const deletedImgs = await query<{ filename: string }>(
          `DELETE FROM ${c.imagesTable} WHERE id = ANY($1::uuid[]) AND ${c.imageFkColumn} = $2 RETURNING *`,
          [imagesToDelete, params.id]
        );
        await deleteImageFiles(deletedImgs);
      }

      // Append new images, picking up sort_order after the kept set.
      const newImages = body.image_paths;
      if (Array.isArray(newImages) && newImages.length > 0) {
        const existingCount = await queryOne<{ count: string }>(
          `SELECT COUNT(*) AS count FROM ${c.imagesTable} WHERE ${c.imageFkColumn} = $1`,
          [params.id]
        );
        const hasExisting = parseInt(existingCount?.count ?? "0") > 0;
        const startIndex = Array.isArray(imageOrder)
          ? imageOrder.length
          : hasExisting
          ? parseInt(existingCount?.count ?? "0")
          : 0;
        await insertImagePaths(c, params.id, newImages as ImagePath[], startIndex, hasExisting);
      }

      const fullItem = await queryOne(
        `${listSelectSql(c, false)}
         WHERE ${c.alias}.id = $1
         GROUP BY ${c.alias}.id`,
        [params.id]
      );

      return NextResponse.json(fullItem);
    } catch (error) {
      console.error(`PATCH /api/${c.label}/[id] error:`, error);
      return NextResponse.json(
        { error: `Failed to update ${c.label} item` },
        { status: 500 }
      );
    }
  }

  return { GET, PATCH, DELETE };
}
