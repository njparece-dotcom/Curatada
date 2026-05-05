-- ── Items of Distinction ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS items_of_distinction (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category            VARCHAR(100) NOT NULL DEFAULT 'collectibles'
                      CHECK (category IN ('fine-art','memorabilia','collectibles','jewelry','other')),
  item_type           VARCHAR(255),
  brand               VARCHAR(255),
  short_description   VARCHAR(500) NOT NULL,
  long_description    TEXT,
  year                INTEGER,
  condition           VARCHAR(50) CHECK (condition IN ('Mint','Excellent','Very Good','Good','Fair','Poor')),
  purchase_price      NUMERIC(12,2),
  purchase_date       DATE,
  purchase_source     VARCHAR(255),
  provenance          TEXT,
  notes               TEXT,
  latest_ai_price     NUMERIC(12,2),
  latest_ai_price_date TIMESTAMPTZ,
  latest_user_price   NUMERIC(12,2),
  latest_user_price_date TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iod_category  ON items_of_distinction(category);
CREATE INDEX IF NOT EXISTS idx_iod_item_type ON items_of_distinction(item_type);

-- IoD images
CREATE TABLE IF NOT EXISTS iod_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iod_id      UUID NOT NULL REFERENCES items_of_distinction(id) ON DELETE CASCADE,
  filename    VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  path        TEXT NOT NULL,
  mime_type   VARCHAR(100),
  size        BIGINT,
  is_primary  BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iod_images_iod_id ON iod_images(iod_id);

-- IoD valuations
CREATE TABLE IF NOT EXISTS iod_valuations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iod_id          UUID NOT NULL REFERENCES items_of_distinction(id) ON DELETE CASCADE,
  valuation_type  VARCHAR(20) NOT NULL CHECK (valuation_type IN ('ai','user')),
  price           NUMERIC(12,2) NOT NULL,
  notes           TEXT,
  comparable_sales JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iod_valuations_iod_id  ON iod_valuations(iod_id);
CREATE INDEX IF NOT EXISTS idx_iod_valuations_created ON iod_valuations(created_at DESC);

-- Updated-at trigger
CREATE OR REPLACE TRIGGER iod_updated_at
  BEFORE UPDATE ON items_of_distinction
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
