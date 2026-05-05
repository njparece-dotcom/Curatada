-- Add user_id to all pursuit tables
ALTER TABLE guitar_pursuits ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE watch_pursuits  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- auto_pursuits and iod_pursuits may or may not exist
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'auto_pursuits') THEN
    EXECUTE 'ALTER TABLE auto_pursuits ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'iod_pursuits') THEN
    EXECUTE 'ALTER TABLE iod_pursuits ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE';
  END IF;
END $$;

-- Assign existing pursuits to the first user who has items (the original owner)
UPDATE guitar_pursuits SET user_id = (SELECT id FROM users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL;
UPDATE watch_pursuits  SET user_id = (SELECT id FROM users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL;
