-- Migration: add platform column to orders table
-- Run once via Supabase SQL Editor

-- 1. Add platform column (defaults to 'shopee' for all existing rows)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'shopee'
    CHECK (platform IN ('shopee', 'tiktok'));

-- 2. Add tiktok_buyer_uid column for TikTok-specific buyer identity
--    (TikTok buyer IDs are strings, not compatible with the BIGINT buyer_user_id)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tiktok_buyer_uid TEXT;

-- 3. Index for efficient platform-filtered queries
CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(platform);
CREATE INDEX IF NOT EXISTS idx_orders_platform_create_time ON orders(platform, create_time);
CREATE INDEX IF NOT EXISTS idx_orders_tiktok_buyer_uid ON orders(tiktok_buyer_uid)
  WHERE tiktok_buyer_uid IS NOT NULL;

-- 4. Update sync_state: TikTok will use separate watermark keys
--    ('tiktok_last_create_sync', 'tiktok_last_update_sync')
--    No schema change needed — sync_state is a generic key/value table.
