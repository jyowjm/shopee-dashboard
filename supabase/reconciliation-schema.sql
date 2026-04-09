-- Shopee Fee Reconciliation Tables
-- Run once against your Supabase project via the SQL editor or CLI.

-- One row per reconciliation run (a period + source combination)
CREATE TABLE IF NOT EXISTS payout_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_from   date NOT NULL,
  period_to     date NOT NULL,
  source        text NOT NULL CHECK (source IN ('xlsx', 'api')),
  created_at    timestamptz DEFAULT now(),
  total_expected  numeric(10,2),
  total_actual    numeric(10,2),
  total_diff      numeric(10,2)
);

-- One row per order within a reconciliation run
CREATE TABLE IF NOT EXISTS payout_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid NOT NULL REFERENCES payout_periods(id) ON DELETE CASCADE,
  order_sn        text NOT NULL,
  payout_date     date,
  product_price   numeric(10,2),    -- base = product_price after seller discounts/vouchers
  payment_method  text,
  payment_installment text,
  is_campaign_day boolean DEFAULT false,
  -- actuals (positive values = absolute fee amounts)
  commission_actual         numeric(10,2),
  transaction_actual        numeric(10,2),
  platform_support_actual   numeric(10,2),
  cashback_actual           numeric(10,2),
  ams_actual                numeric(10,2),
  -- expected (calculated by reconciliation engine)
  commission_expected       numeric(10,2),
  transaction_expected      numeric(10,2),
  platform_support_expected numeric(10,2),
  cashback_expected         numeric(10,2),
  ams_expected              numeric(10,2),
  ams_rate_used             numeric(6,4),   -- AMS rate snapshot at reconciliation time
  -- diffs (actual - expected; positive = overcharged)
  commission_diff           numeric(10,2),
  transaction_diff          numeric(10,2),
  platform_support_diff     numeric(10,2),
  cashback_diff             numeric(10,2),
  ams_diff                  numeric(10,2),
  total_diff                numeric(10,2),
  has_discrepancy           boolean DEFAULT false
);

-- Discrepancy status tracking (one row per order under investigation)
CREATE TABLE IF NOT EXISTS recon_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_sn    text NOT NULL,
  period_id   uuid NOT NULL REFERENCES payout_periods(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'unreviewed'
                CHECK (status IN ('unreviewed', 'investigating', 'resolved')),
  notes       text,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (order_sn, period_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_orders_period   ON payout_orders(period_id);
CREATE INDEX IF NOT EXISTS idx_payout_orders_discr    ON payout_orders(has_discrepancy);
CREATE INDEX IF NOT EXISTS idx_recon_notes_period     ON recon_notes(period_id, status);
