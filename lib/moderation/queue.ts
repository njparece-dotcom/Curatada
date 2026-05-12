// Cross-module moderation queue helpers.
//
// The admin review queue (app/admin/moderation) and the decision endpoint
// both need to address image rows across four tables (guitar_images,
// watch_images, auto_images, iod_images) by a `(module, image_id)` tuple.
// This module is the single source of truth for that mapping — touching a
// new image-bearing module means adding one entry to MODULE_TABLES and the
// SQL bits flow through.

import type { ModuleSlug } from "@/lib/collections/types";

export interface ModuleTableSpec {
  module: ModuleSlug;
  imagesTable: string;
  imageFkColumn: string;
  parentTable: string;
  /**
   * SQL expression that produces a human-readable item label, evaluated with
   * the parent table aliased as `p`. Used to render the queue rows so the
   * admin can see what they're reviewing without clicking through.
   */
  labelSql: string;
}

export const MODULE_TABLES: readonly ModuleTableSpec[] = [
  {
    module: "guitars",
    imagesTable: "guitar_images",
    imageFkColumn: "guitar_item_id",
    parentTable: "guitar_items",
    labelSql:
      "TRIM(BOTH ' ' FROM COALESCE(p.brand, '') || ' ' || COALESCE(p.model, ''))",
  },
  {
    module: "watches",
    imagesTable: "watch_images",
    imageFkColumn: "watch_item_id",
    parentTable: "watch_items",
    labelSql:
      "TRIM(BOTH ' ' FROM COALESCE(p.brand, '') || ' ' || COALESCE(p.model, ''))",
  },
  {
    module: "automobiles",
    imagesTable: "auto_images",
    imageFkColumn: "auto_id",
    parentTable: "automobiles",
    labelSql:
      "TRIM(BOTH ' ' FROM COALESCE(p.brand, '') || ' ' || COALESCE(p.model, ''))",
  },
  {
    module: "iod",
    imagesTable: "iod_images",
    imageFkColumn: "iod_id",
    parentTable: "items_of_distinction",
    // IoD doesn't have a brand+model pair — short_description is the
    // human-readable identifier.
    labelSql: "p.short_description",
  },
];

export function getModuleSpec(slug: string): ModuleTableSpec | null {
  return MODULE_TABLES.find((s) => s.module === slug) ?? null;
}

export const ALL_STATUSES = [
  "unreviewed",
  "clean",
  "flagged",
  "approved",
  "blocked",
] as const;

export type ModerationStatus = (typeof ALL_STATUSES)[number];

export function parseStatuses(raw: string | null): ModerationStatus[] {
  if (!raw) return ["flagged", "unreviewed"];
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const filtered = parts.filter((p): p is ModerationStatus =>
    (ALL_STATUSES as readonly string[]).includes(p),
  );
  return filtered.length > 0 ? filtered : ["flagged", "unreviewed"];
}

/**
 * Build the UNION ALL SELECT used by the queue list endpoint. Returns a
 * single SQL string with three positional params: $1 = status array,
 * $2 = min score, $3 = limit, $4 = offset.
 */
export function buildQueueSql(): string {
  const branches = MODULE_TABLES.map(
    (m) => `
    SELECT
      '${m.module}'::text     AS module,
      img.id                  AS image_id,
      img.${m.imageFkColumn}  AS item_id,
      img.filename,
      img.path,
      img.mime_type,
      img.is_primary,
      img.moderation_status,
      img.nsfw_score,
      img.nsfw_categories,
      img.created_at,
      ${m.labelSql}           AS item_label,
      p.user_id               AS user_id
    FROM ${m.imagesTable} img
    JOIN ${m.parentTable} p ON p.id = img.${m.imageFkColumn}
    WHERE img.moderation_status = ANY($1)
      AND COALESCE(img.nsfw_score, 0) >= $2`,
  ).join("\n  UNION ALL");

  return `${branches}
  ORDER BY created_at DESC
  LIMIT $3 OFFSET $4`;
}
