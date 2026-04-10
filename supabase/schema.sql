-- ============================================================
-- Shopee Customer Database Schema
-- Apply once via Supabase SQL Editor
-- ============================================================

-- Buyers table: one row per unique buyer_user_id
CREATE TABLE IF NOT EXISTS buyers (
  buyer_user_id     BIGINT        PRIMARY KEY,
  buyer_username    TEXT,
  has_paid_order    BOOLEAN       NOT NULL DEFAULT FALSE,
  total_orders      INTEGER       NOT NULL DEFAULT 0,
  paid_orders       INTEGER       NOT NULL DEFAULT 0,
  cancelled_orders  INTEGER       NOT NULL DEFAULT 0,
  total_spend       NUMERIC(12,2) NOT NULL DEFAULT 0,
  first_paid_at     TIMESTAMPTZ,
  last_paid_at      TIMESTAMPTZ,
  first_order_at    TIMESTAMPTZ,
  last_order_at     TIMESTAMPTZ,
  primary_state     TEXT,
  prefers_cod       BOOLEAN,
  last_seen_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Orders table: all customer-relevant fields from API and report
CREATE TABLE IF NOT EXISTS orders (
  order_sn                      TEXT          PRIMARY KEY,
  buyer_user_id                 BIGINT        REFERENCES buyers(buyer_user_id) ON DELETE SET NULL,
  -- Default API fields
  region                        TEXT,
  currency                      TEXT,
  cod                           BOOLEAN,
  order_status                  TEXT          NOT NULL,
  message_to_seller             TEXT,
  create_time                   TIMESTAMPTZ   NOT NULL,
  update_time                   TIMESTAMPTZ,
  days_to_ship                  INTEGER,
  ship_by_date                  TIMESTAMPTZ,
  -- Optional API / report fields (same customer data)
  buyer_username                TEXT,
  total_amount                  NUMERIC(12,2),
  pay_time                      TIMESTAMPTZ,
  payment_method                TEXT,
  shipping_carrier              TEXT,
  fulfillment_flag              TEXT,
  cancel_reason                 TEXT,
  cancel_by                     TEXT,
  buyer_cancel_reason           TEXT,
  estimated_shipping_fee        NUMERIC(10,2),
  actual_shipping_fee           NUMERIC(10,2),
  actual_shipping_fee_confirmed BOOLEAN,
  -- Address fields (from both API and report)
  recipient_name                TEXT,
  recipient_phone               TEXT,
  recipient_town                TEXT,
  recipient_district            TEXT,
  recipient_city                TEXT,
  recipient_state               TEXT,
  recipient_region              TEXT,
  recipient_zipcode             TEXT,
  -- Logistics/fulfilment fields (primarily from report)
  tracking_number               TEXT,
  ship_time                     TIMESTAMPTZ,
  order_complete_time           TIMESTAMPTZ,
  return_refund_status          TEXT,
  shipment_method               TEXT,
  -- TikTok-specific buyer identity (TikTok buyer IDs are strings, not BIGINT)
  tiktok_buyer_uid              TEXT,
  -- Computed / meta
  platform                      TEXT          NOT NULL DEFAULT 'shopee'
                                  CHECK (platform IN ('shopee', 'tiktok')),
  is_paid_order                 BOOLEAN       NOT NULL DEFAULT FALSE,
  data_source                   TEXT          NOT NULL DEFAULT 'api',
  synced_at                     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_user_id ON orders(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_create_time   ON orders(create_time);
CREATE INDEX IF NOT EXISTS idx_orders_update_time   ON orders(update_time);
CREATE INDEX IF NOT EXISTS idx_orders_order_status  ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_platform      ON orders(platform);
CREATE INDEX IF NOT EXISTS idx_orders_platform_create_time ON orders(platform, create_time);
CREATE INDEX IF NOT EXISTS idx_orders_tiktok_buyer_uid ON orders(tiktok_buyer_uid)
  WHERE tiktok_buyer_uid IS NOT NULL;

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id                        BIGSERIAL     PRIMARY KEY,
  order_sn                  TEXT          NOT NULL REFERENCES orders(order_sn) ON DELETE CASCADE,
  item_id                   BIGINT,
  item_name                 TEXT,
  item_sku                  TEXT,
  model_id                  BIGINT,
  model_name                TEXT,
  model_sku                 TEXT,
  model_quantity_purchased  INTEGER,
  model_original_price      NUMERIC(12,2),
  model_discounted_price    NUMERIC(12,2),
  promotion_type            TEXT,
  image_url                 TEXT,
  -- Report-only customer item fields
  returned_quantity         INTEGER,
  total_buyer_payment       NUMERIC(12,2),
  voucher_code              TEXT,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_sn ON order_items(order_sn);
CREATE INDEX IF NOT EXISTS idx_order_items_item_id  ON order_items(item_id);

-- Sync state: key/value store for watermarks
CREATE TABLE IF NOT EXISTS sync_state (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- upsert_buyers: recomputes buyer aggregates from orders for a given set of buyer IDs
CREATE OR REPLACE FUNCTION upsert_buyers(buyer_ids BIGINT[])
RETURNS void AS $$
INSERT INTO buyers (
  buyer_user_id, buyer_username, has_paid_order,
  total_orders, paid_orders, cancelled_orders, total_spend,
  first_paid_at, last_paid_at, first_order_at, last_order_at,
  primary_state, prefers_cod, last_seen_at, updated_at
)
SELECT
  o.buyer_user_id,
  (SELECT buyer_username FROM orders
   WHERE buyer_user_id = o.buyer_user_id AND buyer_username IS NOT NULL
   ORDER BY create_time DESC LIMIT 1),
  BOOL_OR(o.is_paid_order),
  COUNT(*)::INTEGER,
  COUNT(*) FILTER (WHERE o.is_paid_order)::INTEGER,
  COUNT(*) FILTER (WHERE o.order_status IN ('CANCELLED','IN_CANCEL'))::INTEGER,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_paid_order), 0),
  MIN(o.create_time) FILTER (WHERE o.is_paid_order),
  MAX(o.create_time) FILTER (WHERE o.is_paid_order),
  MIN(o.create_time),
  MAX(o.create_time),
  (SELECT recipient_state FROM orders
   WHERE buyer_user_id = o.buyer_user_id AND recipient_state IS NOT NULL
   GROUP BY recipient_state ORDER BY COUNT(*) DESC LIMIT 1),
  (COUNT(*) FILTER (WHERE o.is_paid_order AND o.cod) >
   COUNT(*) FILTER (WHERE o.is_paid_order) / 2.0),
  MAX(o.create_time),
  NOW()
FROM orders o
WHERE o.buyer_user_id = ANY(buyer_ids) AND o.buyer_user_id IS NOT NULL
GROUP BY o.buyer_user_id
ON CONFLICT (buyer_user_id) DO UPDATE SET
  buyer_username   = EXCLUDED.buyer_username,
  has_paid_order   = EXCLUDED.has_paid_order,
  total_orders     = EXCLUDED.total_orders,
  paid_orders      = EXCLUDED.paid_orders,
  cancelled_orders = EXCLUDED.cancelled_orders,
  total_spend      = EXCLUDED.total_spend,
  first_paid_at    = EXCLUDED.first_paid_at,
  last_paid_at     = EXCLUDED.last_paid_at,
  first_order_at   = EXCLUDED.first_order_at,
  last_order_at    = EXCLUDED.last_order_at,
  primary_state    = EXCLUDED.primary_state,
  prefers_cod      = EXCLUDED.prefers_cod,
  last_seen_at     = EXCLUDED.last_seen_at,
  updated_at       = EXCLUDED.updated_at;
$$ LANGUAGE sql;
