-- Qlection Database Schema
-- Migration: 001_init.sql

CREATE TABLE IF NOT EXISTS guitar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL CHECK (category IN ('electric-guitars', 'acoustic-guitars', 'amplifiers', 'pedals')),
  brand VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL,
  year INTEGER,
  serial_number VARCHAR(255),
  condition VARCHAR(50) NOT NULL CHECK (condition IN ('Mint', 'Excellent', 'Very Good', 'Good', 'Fair', 'Poor')),
  purchase_price NUMERIC(10, 2),
  purchase_source VARCHAR(255),
  color_finish VARCHAR(255),
  short_description TEXT,
  link TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guitar_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guitar_item_id UUID NOT NULL REFERENCES guitar_items(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  path TEXT NOT NULL,
  mime_type VARCHAR(100),
  size INTEGER,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guitar_items_category ON guitar_items(category);
CREATE INDEX IF NOT EXISTS idx_guitar_images_guitar_item_id ON guitar_images(guitar_item_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_guitar_items_updated_at
  BEFORE UPDATE ON guitar_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
