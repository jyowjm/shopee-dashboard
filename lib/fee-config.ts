/**
 * Shopee Malaysia fee rate configuration for reconciliation.
 *
 * UPDATE THIS FILE (alongside docs/shopee-fees-reference.md) whenever
 * Shopee revises rates.
 *
 * All rates are PRE-SST unless noted. SST (8%) is applied by the engine.
 * See docs/shopee-fees-reference.md for full formulas and context.
 */
export const FEE_CONFIG = {
  // ── Commission ───────────────────────────────────────────────────────────
  // Pre-SST commission rate for your product category.
  // Health & Beauty / Supplements: 11%
  // Find your rate at: https://seller.shopee.com.my/edu/article/6799
  marketplace_commission_rate: 0.11,

  // ── Cashback Programme ───────────────────────────────────────────────────
  // Set to true if your shop is enrolled in the Shopee Cashback Programme.
  cashback_enrolled: true,
  cashback_rate_non_campaign: 0.055, // 5.5% pre-SST
  cashback_rate_campaign: 0.075, // 7.5% pre-SST (Double-Digit, Mid-month, Payday)
  cashback_cap_incl_sst: 108.0, // RM108 per item (incl. SST)

  // ── Platform Support Fee ─────────────────────────────────────────────────
  // RM0.54 per completed order (RM0.50 + 8% SST). Flat fee.
  // Effective 16 July 2025.
  platform_support_fee: 0.54,

  // ── Transaction Fee ──────────────────────────────────────────────────────
  // Pre-SST rates by payment method.
  // SST is applied by the engine: effective_rate = rate × 1.08
  transaction_fee_rates: {
    default: 0.035, // 3.5% → 3.78% incl. SST (Online Banking, Credit/Debit Card, ShopeePay, COD)
    SPayLater_1x: 0.045, // 4.5% → 4.86% incl. SST
    SPayLater_3x: 0.05, // 5.0% → 5.40% incl. SST
    SPayLater_6x: 0.045, // 4.5% → 4.86% incl. SST
    SPayLater_12x: 0.045, // 4.5% → 4.86% incl. SST
    SPayLater_18x: 0.045, // 4.5% → 4.86% incl. SST
    SPayLater_24x: 0.045, // 4.5% → 4.86% incl. SST
    SPayLater_36x: 0.045, // 4.5% → 4.86% incl. SST
    SPayLater_48x: 0.045, // 4.5% → 4.86% incl. SST
    // CCI (Credit Card Instalment) — pre-SST rates
    CCI_3x: 0.035, // 3.5% → 3.78% incl. SST
    CCI_6x: 0.04, // 4.0% → 4.32% incl. SST
    CCI_12x: 0.05, // 5.0% → 5.40% incl. SST
    CCI_18x: 0.06, // 6.0% → 6.48% incl. SST
    CCI_24x: 0.065, // 6.5% → 7.02% incl. SST
    CCI_36x: 0.075, // 7.5% → 8.10% incl. SST
  } as Record<string, number>,

  // ── AMS Commission ───────────────────────────────────────────────────────
  // Fallback rate used only when fetchAmsConversionReport() is unavailable or
  // returns no data for an order. When API data IS present, the engine uses
  // order_brand_commission directly (already incl. SST + direct/indirect split).
  //
  // Fallback formula: ROUND(base × rate × 1.08, 2)
  // where base = product_price − seller_voucher
  //
  // Update this rate to match your current Shopee Ads commission setting.
  ams_commission_rate: 0.03, // 3% pre-SST

  // ── SST ──────────────────────────────────────────────────────────────────
  sst_rate: 0.08, // 8% SST applied on top of all pre-SST fee rates

  // ── Reconciliation ───────────────────────────────────────────────────────
  // Differences smaller than this (in RM) are treated as floating-point noise.
  tolerance: 0.02,

  // ── Campaign Days ────────────────────────────────────────────────────────
  // Shopee campaign days for 2026 (YYYY-MM-DD).
  // Campaign period: 8pm D-1 through 11:59pm D-day.
  // Add mid-month and payday dates as they are announced.
  // Double-digit dates are fixed; others vary by campaign calendar.
  campaign_days: [
    // Double-digit days
    '2026-01-01',
    '2026-02-02',
    '2026-03-03',
    '2026-04-04',
    '2026-05-05',
    '2026-06-06',
    '2026-07-07',
    '2026-08-08',
    '2026-09-09',
    '2026-10-10',
    '2026-11-11',
    '2026-12-12',
    // Mid-month (add dates here as announced, e.g. '2026-04-15')
    // Payday (add dates here as announced, e.g. '2026-04-25')
  ],
} as const;

export type FeeConfig = typeof FEE_CONFIG;
