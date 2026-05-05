-- Watch tables (mirrors guitar schema but with watch-specific fields)
CREATE TABLE IF NOT EXISTS watch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL CHECK (category IN ('luxury-watches', 'sport-watches', 'dress-watches', 'vintage-watches')),
  brand VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL,
  year INTEGER,
  serial_number VARCHAR(255),
  condition VARCHAR(50) NOT NULL CHECK (condition IN ('Mint', 'Excellent', 'Very Good', 'Good', 'Fair', 'Poor')),
  purchase_price NUMERIC(10, 2),
  purchase_source VARCHAR(255),
  dial_color VARCHAR(255),
  country_of_manufacture VARCHAR(255),
  movement VARCHAR(255),
  bracelet_material VARCHAR(255),
  case_material VARCHAR(255),
  short_description TEXT,
  link TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watch_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_item_id UUID NOT NULL REFERENCES watch_items(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  path TEXT NOT NULL,
  mime_type VARCHAR(100),
  size INTEGER,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watch_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_item_id UUID NOT NULL REFERENCES watch_items(id) ON DELETE CASCADE,
  valuation_type VARCHAR(10) NOT NULL CHECK (valuation_type IN ('ai', 'user')),
  price NUMERIC(10, 2) NOT NULL,
  notes TEXT,
  comparable_sales JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watch_items_category ON watch_items(category);
CREATE INDEX IF NOT EXISTS idx_watch_images_watch_item_id ON watch_images(watch_item_id);
CREATE INDEX IF NOT EXISTS idx_watch_images_sort_order ON watch_images(watch_item_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_watch_valuations_watch_item_id ON watch_valuations(watch_item_id);
CREATE INDEX IF NOT EXISTS idx_watch_valuations_created_at ON watch_valuations(watch_item_id, created_at DESC);

CREATE TRIGGER update_watch_items_updated_at
  BEFORE UPDATE ON watch_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
