-- Add 30-day check-in tracking to pursuit tables
-- checkin_snoozed_until: set to NOW() + 30 days when user clicks "keep going"
-- checkin_dismissed:     set to TRUE when user clicks "don't ask me again"

ALTER TABLE guitar_pursuits
  ADD COLUMN IF NOT EXISTS checkin_snoozed_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS checkin_dismissed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE watch_pursuits
  ADD COLUMN IF NOT EXISTS checkin_snoozed_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS checkin_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
