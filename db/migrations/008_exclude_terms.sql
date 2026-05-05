-- Add exclude_terms column to both pursuit tables
-- Stores a comma-separated list of terms to exclude from search results

ALTER TABLE guitar_pursuits ADD COLUMN IF NOT EXISTS exclude_terms TEXT;
ALTER TABLE watch_pursuits  ADD COLUMN IF NOT EXISTS exclude_terms TEXT;
