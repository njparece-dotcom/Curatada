-- ── Automobiles ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS automobiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category            VARCHAR(50) NOT NULL DEFAULT 'household'
                      CHECK (category IN ('collection', 'household')),
  brand               VARCHAR(255) NOT NULL,
  model               VARCHAR(255) NOT NULL,
  year                INTEGER,
  description         TEXT,
  trim_level          VARCHAR(255),
  engine              VARCHAR(255),
  transmission        VARCHAR(100),
  mileage             INTEGER,
  condition           VARCHAR(50) CHECK (condition IN ('Mint','Excellent','Very Good','Good','Fair','Poor')),
  body_style          VARCHAR(100),
  color               VARCHAR(100),
  vin                 VARCHAR(50),
  purchase_price      NUMERIC(12,2),
  purchase_date       DATE,
  purchase_source     VARCHAR(255),
  notes               TEXT,
  latest_ai_price     NUMERIC(12,2),
  latest_ai_price_date TIMESTAMPTZ,
  latest_user_price   NUMERIC(12,2),
  latest_user_price_date TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automobiles_category ON automobiles(category);
CREATE INDEX IF NOT EXISTS idx_automobiles_brand    ON automobiles(brand);

-- Auto images
CREATE TABLE IF NOT EXISTS auto_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_id     UUID NOT NULL REFERENCES automobiles(id) ON DELETE CASCADE,
  filename    VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  path        TEXT NOT NULL,
  mime_type   VARCHAR(100),
  size        BIGINT,
  is_primary  BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_images_auto_id ON auto_images(auto_id);

-- Auto valuations
CREATE TABLE IF NOT EXISTS auto_valuations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_id         UUID NOT NULL REFERENCES automobiles(id) ON DELETE CASCADE,
  valuation_type  VARCHAR(20) NOT NULL CHECK (valuation_type IN ('ai','user')),
  price           NUMERIC(12,2) NOT NULL,
  notes           TEXT,
  comparable_sales JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_valuations_auto_id ON auto_valuations(auto_id);
CREATE INDEX IF NOT EXISTS idx_auto_valuations_created ON auto_valuations(created_at DESC);

-- Updated-at trigger
CREATE OR REPLACE TRIGGER automobiles_updated_at
  BEFORE UPDATE ON automobiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
