-- ── Refresh tokens for the Bearer-auth API ──────────────────────────────────
--
-- The web app authenticates with NextAuth's session cookie (JWT strategy, set
-- on the browser via the `next-auth.session-token` cookie). That flow does not
-- map cleanly onto a native mobile client, so the iOS app (and any future
-- native client) authenticates against a parallel Bearer-token API:
--
--   POST /api/auth/token    credentials  -> { access, refresh }
--   POST /api/auth/social   id_token     -> { access, refresh }
--   POST /api/auth/refresh  refresh      -> { access, refresh }   (rotated)
--   GET  /api/status        Bearer       -> session user
--
-- The access token is a short-lived (15 minute) signed JWT — never persisted
-- server-side; verified statelessly. The refresh token is a long-lived (30
-- day) opaque random string; this table is its server-side record so we can
-- revoke it (sign-out, rotation, suspicious activity). Only the SHA-256 hash
-- of the token is stored, so a database compromise alone doesn't yield
-- valid refresh tokens.
--
-- Rotation: every successful /api/auth/refresh issues a new refresh token and
-- marks the previous row's `revoked_at`. The new row's `replaced_by` points
-- back at the old `id`, giving a tamper-detection chain — if a revoked token
-- is ever presented again it's a sign of a stolen secret and the entire chain
-- can be invalidated (handled in app logic, not in this schema).

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT        NOT NULL UNIQUE,
  client        TEXT,                                              -- e.g. 'ios', 'cli'
  user_agent    TEXT,
  ip            TEXT,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  replaced_by   UUID        REFERENCES refresh_tokens(id) ON DELETE SET NULL
);

-- Lookup by hash on every refresh; user-scoped revocation sweeps.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON refresh_tokens (user_id);

-- "Active per user" query — only the rows that could still authenticate.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active
  ON refresh_tokens (user_id, expires_at)
  WHERE revoked_at IS NULL;
