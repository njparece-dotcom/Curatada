-- Add sort_order column to guitar_images for user-defined ordering
ALTER TABLE guitar_images ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows: primary image = 0, rest ordered by created_at
WITH ranked AS (
  SELECT id,
    (ROW_NUMBER() OVER (
      PARTITION BY guitar_item_id
      ORDER BY is_primary DESC, created_at ASC
    ) - 1)::int AS rn
  FROM guitar_images
)
UPDATE guitar_images gi
SET sort_order = ranked.rn
FROM ranked
WHERE gi.id = ranked.id;

-- Index for fast sort
CREATE INDEX IF NOT EXISTS idx_guitar_images_sort ON guitar_images (guitar_item_id, sort_order);
