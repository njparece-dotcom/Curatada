-- ── Image moderation metadata — schema migration ────────────────────────────
--
-- First-pass content moderation for uploaded images. The NSFW.js classifier
-- (TensorFlow.js model, runs in-process) scores every image at upload time and
-- stores a verdict on the row. At very high confidence (>= 0.95) the upload is
-- refused outright and no row is ever created — so anything that DOES land in
-- the table is at minimum "not obviously pornographic", and at most "flagged
-- for review before going public".
--
-- A planned Tier-2 pass (Claude vision) will revisit `flagged` rows at the
-- moment they enter a public gallery, transitioning them to `approved` or
-- `blocked`. That feature is deferred — this migration just lays the
-- columns so the data is recorded from day one.
--
-- Status values:
--   'unreviewed' — row predates this column (legacy backfill); no verdict yet
--   'clean'      — NSFW.js score < 0.50 (kept as-is, no review needed)
--   'flagged'    — NSFW.js score 0.50 <= s < 0.95 (let through but mark for
--                  Tier-2 review before public exposure)
--   'blocked'    — Tier-2 (Claude) verdict said no; image withheld from
--                  any public surface
--   'approved'   — Tier-2 verdict explicitly cleared a previously-flagged row
--
-- `nsfw_score` is the max(probability) across the {Porn, Sexy, Hentai}
-- categories from NSFW.js. `nsfw_categories` retains the full classifier
-- output as JSON for any future analysis.
--
-- Posture: greenfield-additive. Existing rows backfill to 'unreviewed' — they
-- were uploaded before this pipeline existed, so we don't pretend to have an
-- opinion. The public-gallery feature (the only place where moderation status
-- gates exposure) will treat 'unreviewed' the same as 'flagged' until run
-- through Tier-2.

ALTER TABLE guitar_images
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (moderation_status IN ('unreviewed','clean','flagged','blocked','approved')),
  ADD COLUMN IF NOT EXISTS nsfw_score NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS nsfw_categories JSONB;

ALTER TABLE watch_images
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (moderation_status IN ('unreviewed','clean','flagged','blocked','approved')),
  ADD COLUMN IF NOT EXISTS nsfw_score NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS nsfw_categories JSONB;

ALTER TABLE auto_images
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (moderation_status IN ('unreviewed','clean','flagged','blocked','approved')),
  ADD COLUMN IF NOT EXISTS nsfw_score NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS nsfw_categories JSONB;

ALTER TABLE iod_images
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (moderation_status IN ('unreviewed','clean','flagged','blocked','approved')),
  ADD COLUMN IF NOT EXISTS nsfw_score NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS nsfw_categories JSONB;

-- Indexes power the eventual admin "review queue" + the public gallery's
-- "only show clean/approved images" filter. Partial indexes keep them tiny —
-- the overwhelming majority of rows will be 'clean'.

CREATE INDEX IF NOT EXISTS idx_guitar_images_mod_review
  ON guitar_images (created_at DESC)
  WHERE moderation_status IN ('flagged', 'unreviewed');

CREATE INDEX IF NOT EXISTS idx_watch_images_mod_review
  ON watch_images (created_at DESC)
  WHERE moderation_status IN ('flagged', 'unreviewed');

CREATE INDEX IF NOT EXISTS idx_auto_images_mod_review
  ON auto_images (created_at DESC)
  WHERE moderation_status IN ('flagged', 'unreviewed');

CREATE INDEX IF NOT EXISTS idx_iod_images_mod_review
  ON iod_images (created_at DESC)
  WHERE moderation_status IN ('flagged', 'unreviewed');
