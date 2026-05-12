-- ── CUR-2: Insurance Validation and Paperwork — schema migration ─────────────
-- Epic: CUR-1 — https://nextideaup.atlassian.net/browse/CUR-1
-- Story: CUR-2 — https://nextideaup.atlassian.net/browse/CUR-2
--
-- Scope:
--   1. Add per-item insurance fields + archive flag to all 4 collection tables
--      (guitar_items, watch_items, automobiles, items_of_distinction).
--   2. Add insure-active partial index + archived_at index per item table.
--   3. Create insurance_valuation_norms config table (per-category multipliers
--      researched via Anthropic web_search; populated by Story CUR-4).
--   4. Create paperwork_generations log table (PDF export audit trail;
--      populated by Story CUR-8).
--
-- Posture: greenfield-additive. Safe defaults (insure=false, archived_at=null,
-- insurance_value=null) mean existing rows are inert until a user opts in.
-- Forward-only per project convention; no down-migration.

-- ── 1. Per-item insurance + archive columns ──────────────────────────────────

ALTER TABLE guitar_items
  ADD COLUMN IF NOT EXISTS insure BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS insurance_value NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS insurance_value_source TEXT
      CHECK (insurance_value_source IN ('ai', 'alternate_from_user', 'user_override')),
  ADD COLUMN IF NOT EXISTS insurance_value_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE watch_items
  ADD COLUMN IF NOT EXISTS insure BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS insurance_value NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS insurance_value_source TEXT
      CHECK (insurance_value_source IN ('ai', 'alternate_from_user', 'user_override')),
  ADD COLUMN IF NOT EXISTS insurance_value_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE automobiles
  ADD COLUMN IF NOT EXISTS insure BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS insurance_value NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS insurance_value_source TEXT
      CHECK (insurance_value_source IN ('ai', 'alternate_from_user', 'user_override')),
  ADD COLUMN IF NOT EXISTS insurance_value_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE items_of_distinction
  ADD COLUMN IF NOT EXISTS insure BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS insurance_value NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS insurance_value_source TEXT
      CHECK (insurance_value_source IN ('ai', 'alternate_from_user', 'user_override')),
  ADD COLUMN IF NOT EXISTS insurance_value_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ── 2. Indexes per item table ────────────────────────────────────────────────
--
-- Insure-active partial indexes power the insurance schedule query (UNION
-- across all 4 tables filtered to insure=TRUE AND archived_at IS NULL).
-- Partial indexes mean we only carry the rows we actually query.

CREATE INDEX IF NOT EXISTS idx_guitar_items_insure_active
  ON guitar_items (user_id)
  WHERE insure = TRUE AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watch_items_insure_active
  ON watch_items (user_id)
  WHERE insure = TRUE AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_automobiles_insure_active
  ON automobiles (user_id)
  WHERE insure = TRUE AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_iod_insure_active
  ON items_of_distinction (user_id)
  WHERE insure = TRUE AND archived_at IS NULL;

-- Archived-at indexes power the active/archived filter on list queries.
-- Composite on (user_id, archived_at) so the default "active items for this
-- user" query (the common case) hits the index without a sort.

CREATE INDEX IF NOT EXISTS idx_guitar_items_archived_at
  ON guitar_items (user_id, archived_at);

CREATE INDEX IF NOT EXISTS idx_watch_items_archived_at
  ON watch_items (user_id, archived_at);

CREATE INDEX IF NOT EXISTS idx_automobiles_archived_at
  ON automobiles (user_id, archived_at);

CREATE INDEX IF NOT EXISTS idx_iod_archived_at
  ON items_of_distinction (user_id, archived_at);

-- ── 3. Insurance valuation norms config table ────────────────────────────────
--
-- Per-category insurance-vs-sale-price multipliers, researched once per
-- category via Anthropic web_search and cached for 90 days (see Story CUR-4).
-- Not user-scoped — these are org-wide config that applies to every user's
-- valuations of items in the same category.

CREATE TABLE IF NOT EXISTS insurance_valuation_norms (
  module       TEXT NOT NULL,
  category     TEXT NOT NULL,
  multiplier   NUMERIC(6, 4) NOT NULL,
  notes        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (module, category)
);

-- ── 4. Paperwork generation log ──────────────────────────────────────────────
--
-- Audit trail of past PDF exports. Powers a future "regenerate last year's
-- schedule" feature (not in scope for this Epic). user_id-scoped so a user
-- only sees their own history.

CREATE TABLE IF NOT EXISTS paperwork_generations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                   TEXT NOT NULL CHECK (kind IN ('insurance')),
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  item_count             INTEGER NOT NULL,
  total_insured_value    NUMERIC(14, 2) NOT NULL,
  pdf_path               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paperwork_generations_user_kind_date
  ON paperwork_generations (user_id, kind, generated_at DESC);
