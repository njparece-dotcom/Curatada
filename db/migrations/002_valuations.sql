-- Qlection Database Schema
-- Migration: 002_valuations.sql

CREATE TABLE IF NOT EXISTS guitar_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guitar_item_id UUID NOT NULL REFERENCES guitar_items(id) ON DELETE CASCADE,
  valuation_type VARCHAR(10) NOT NULL CHECK (valuation_type IN ('ai', 'user')),
  price NUMERIC(10, 2) NOT NULL,
  notes TEXT,
  comparable_sales JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guitar_valuations_guitar_item_id ON guitar_valuations(guitar_item_id);
CREATE INDEX IF NOT EXISTS idx_guitar_valuations_created_at ON guitar_valuations(created_at DESC);
