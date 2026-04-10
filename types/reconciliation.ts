// Raw per-order row parsed from payout report (XLSX or API)
export interface PayoutOrderRow {
  order_sn: string
  payout_date: string               // YYYY-MM-DD
  product_price: number             // "Product Price" column — after item rebates but before seller voucher
  seller_voucher: number            // absolute amount of seller-issued voucher
  shipping_fee_by_buyer: number     // shipping fee paid by buyer (excl. SST)
  payment_method: string            // e.g. "Online Banking", "SPayLater"
  payment_installment: string       // e.g. "1x", "3x" — relevant for SPayLater
  amount_paid_by_buyer: number
  refund_amount: number
  order_type: string
  // actuals from report (positive values = absolute deduction amounts)
  commission_actual: number
  transaction_actual: number
  service_fee_actual: number        // combined: platform_support + cashback
  platform_support_actual: number   // from Service Fee Details sheet (XLSX) or estimated (API)
  cashback_actual: number           // derived: service_fee_actual - platform_support_actual
  ams_actual: number
}

// Period metadata extracted from payout report Summary sheet
export interface PayoutPeriodMeta {
  period_from: string     // YYYY-MM-DD
  period_to: string       // YYYY-MM-DD
  total_released: number
  total_fees: number
}

// Per-order reconciliation result (extends actuals with expected + diffs)
export interface ReconOrderResult extends PayoutOrderRow {
  is_campaign_day: boolean
  commission_expected: number
  transaction_expected: number
  platform_support_expected: number
  cashback_expected: number
  ams_expected: number
  ams_rate_used: number
  commission_diff: number          // actual - expected (positive = overcharged)
  transaction_diff: number
  platform_support_diff: number
  cashback_diff: number
  ams_diff: number
  total_diff: number
  has_discrepancy: boolean
}

// Stored payout period (from Supabase)
export interface PayoutPeriod {
  id: string
  period_from: string
  period_to: string
  source: 'xlsx' | 'api'
  created_at: string
  total_expected: number
  total_actual: number
  total_diff: number
}

// Stored payout order (from Supabase)
export interface PayoutOrder extends ReconOrderResult {
  id: string
  period_id: string
  status: 'unreviewed' | 'investigating' | 'resolved'
  notes: string | null
}
