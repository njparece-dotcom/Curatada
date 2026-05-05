-- Backfill user_id on auto/iod pursuits created before route handlers enforced ownership.
-- Mirrors the guitar/watch backfill in 013 — assigns orphans to the earliest-created user
-- (the original single-user owner). Single-user dev data only; multi-user installs should
-- have no orphans.

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'auto_pursuits') THEN
    EXECUTE 'UPDATE auto_pursuits SET user_id = (SELECT id FROM users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'iod_pursuits') THEN
    EXECUTE 'UPDATE iod_pursuits SET user_id = (SELECT id FROM users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL';
  END IF;
END $$;
