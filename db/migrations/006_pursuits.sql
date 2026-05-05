-- ── Guitar Pursuits ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guitar_pursuits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           VARCHAR(255),
  model           VARCHAR(255),
  year_min        INTEGER,
  year_max        INTEGER,
  color_finish    VARCHAR(255),
  price_min       NUMERIC(10,2),
  price_max       NUMERIC(10,2),
  sources         TEXT[]   DEFAULT '{}',
  facebook_location VARCHAR(255),
  notes           TEXT,
  status          VARCHAR(50) DEFAULT 'active'
                  CHECK (status IN ('active','found','paused')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guitar_pursuits_status ON guitar_pursuits(status);

CREATE OR REPLACE TRIGGER guitar_pursuits_updated_at
  BEFORE UPDATE ON guitar_pursuits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Watch Pursuits ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watch_pursuits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand             VARCHAR(255),
  model             VARCHAR(255),
  reference_number  VARCHAR(255),
  case_diameter     VARCHAR(50),
  dial_color        VARCHAR(255),
  materials         VARCHAR(255),
  price_min         NUMERIC(10,2),
  price_max         NUMERIC(10,2),
  sources           TEXT[]   DEFAULT '{}',
  facebook_location VARCHAR(255),
  other_source      VARCHAR(255),
  notes             TEXT,
  status            VARCHAR(50) DEFAULT 'active'
                    CHECK (status IN ('active','found','paused')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watch_pursuits_status ON watch_pursuits(status);

CREATE OR REPLACE TRIGGER watch_pursuits_updated_at
  BEFORE UPDATE ON watch_pursuits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
