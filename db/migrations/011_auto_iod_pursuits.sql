-- ── Automobile Pursuits ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auto_pursuits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand             VARCHAR(255),
  model             VARCHAR(255),
  year_min          INTEGER,
  year_max          INTEGER,
  body_style        VARCHAR(100),
  color             VARCHAR(100),
  mileage_max       INTEGER,
  price_min         NUMERIC(12,2),
  price_max         NUMERIC(12,2),
  sources           TEXT[] DEFAULT '{}',
  facebook_location VARCHAR(255),
  exclude_terms     TEXT,
  notes             TEXT,
  status            VARCHAR(50) DEFAULT 'active'
                    CHECK (status IN ('active','found','paused')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_pursuits_status ON auto_pursuits(status);

CREATE OR REPLACE TRIGGER auto_pursuits_updated_at
  BEFORE UPDATE ON auto_pursuits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Items of Distinction Pursuits ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iod_pursuits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type     VARCHAR(255),
  brand         VARCHAR(255),
  description   VARCHAR(500),
  price_min     NUMERIC(12,2),
  price_max     NUMERIC(12,2),
  sources       TEXT[] DEFAULT '{}',
  exclude_terms TEXT,
  notes         TEXT,
  status        VARCHAR(50) DEFAULT 'active'
                CHECK (status IN ('active','found','paused')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iod_pursuits_status ON iod_pursuits(status);

CREATE OR REPLACE TRIGGER iod_pursuits_updated_at
  BEFORE UPDATE ON iod_pursuits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Extend pursuit_findings to accept new types ───────────────────────────────

ALTER TABLE pursuit_findings
  DROP CONSTRAINT IF EXISTS pursuit_findings_pursuit_type_check;

ALTER TABLE pursuit_findings
  ADD CONSTRAINT pursuit_findings_pursuit_type_check
  CHECK (pursuit_type IN ('guitar','watch','auto','iod'));
