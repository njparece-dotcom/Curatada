// Per-module config consumed by lib/collection-handler.ts. Each of the four
// collection modules (guitars, watches, automobiles, iod) exports one of these
// to drive its list/[id] route handlers.

export interface FieldSpec {
  name: string;
  required?: boolean;
  trim?: boolean;
  // Field type discriminator. Defaults to "string" (current normalize behaviour).
  // "boolean" bypasses the `value || null` coercion in normalizeField so that
  // `false` survives the round-trip — critical for the NOT NULL `insure` column
  // added by CUR-2 (migration 016). Add other types here as needed.
  type?: "boolean";
}

export interface CollectionConfig {
  label: string;             // for error messages and logs
  table: string;             // parent table, e.g. "guitar_items"
  alias: string;             // table alias used in SQL, e.g. "gi"
  imagesTable: string;       // child images table, e.g. "guitar_images"
  imageFkColumn: string;     // FK column on the images table, e.g. "guitar_item_id"
  valuationsTable: string;   // child valuations table
  valuationFkColumn: string; // FK column on the valuations table
  validCategories: readonly string[];
  fields: FieldSpec[];       // body fields for INSERT/UPDATE, in column order
  conditionRequired: boolean; // true: condition must be set + valid; false: validate only when provided
  patchSetUpdatedAt: boolean; // automobiles + iod set updated_at = NOW() in UPDATE; guitars/watches rely on a trigger
  forceDynamic: boolean;     // automobiles + iod export const dynamic = "force-dynamic"
}
