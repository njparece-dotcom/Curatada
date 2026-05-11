-- Track each user's most recent successful sign-in so the mgmt API can
-- compute "active in last N days". Nullable on purpose — existing rows
-- (created before this column existed) stay null until the user signs in
-- again. Index for the active-30d query in /api/mgmt/v1/summary.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_login_at
  ON users(last_login_at DESC NULLS LAST);
