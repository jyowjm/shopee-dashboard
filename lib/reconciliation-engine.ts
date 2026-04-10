import type { PayoutOrderRow, ReconOrderResult } from '@/types/reconciliation'
import type { FeeConfig } from '@/lib/fee-config'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function getTransactionRate(
  paymentMethod: string,
  installment: string,
  config: FeeConfig
): number {
  if (paymentMethod === 'SPayLater') {
    const key = `SPayLater_${installment || '1x'}`
    if (key in config.transaction_fee_rates) {
      return config.transaction_fee_rates[key]
    }
  }
  return config.transaction_fee_rates['default'] ?? 0.035
}

/**
 * Calculate expected fees for a list of payout orders using the fee config.
 * Returns a ReconOrderResult per order with expected fees, diffs, and discrepancy flag.
 *
 * @param orders      - Normalised payout order rows (actuals from report/API)
 * @param config      - Fee rate configuration from lib/fee-config.ts
 * @param amsAmounts  - Optional map of order_sn → expected AMS amount (RM) from
 *                      fetchAmsConversionReport(). When present for an order, used
 *                      directly as ams_expected (already incl. SST + direct/indirect).
 *                      Falls back to config.ams_commission_rate × base × 1.08 when absent.
 */
export function reconcileOrders(
  orders:     PayoutOrderRow[],
  config:     FeeConfig,
  amsAmounts: Map<string, number> = new Map()  // order_sn → expected RM amount from AMS API
): ReconOrderResult[] {
  return orders.map((order) => {
    // Fee bases per Shopee fee documentation:
    // Commission + Cashback base = product_price − seller_voucher
    // Transaction fee base       = product_price − seller_voucher + shipping_fee_by_buyer
    const commissionBase  = order.product_price - order.seller_voucher
    const transactionBase = commissionBase + order.shipping_fee_by_buyer
    const isCampaign = (config.campaign_days as readonly string[]).includes(order.payout_date)
    const sst = 1 + config.sst_rate

    // Commission
    const commission_expected = round2(commissionBase * config.marketplace_commission_rate * sst)

    // Transaction fee
    const txRate = getTransactionRate(order.payment_method, order.payment_installment, config)
    const transaction_expected = round2(transactionBase * txRate * sst)

    // Platform support (flat fee)
    const platform_support_expected = config.platform_support_fee

    // Cashback programme fee
    let cashback_expected = 0
    if (config.cashback_enrolled) {
      const cbRate = isCampaign ? config.cashback_rate_campaign : config.cashback_rate_non_campaign
      cashback_expected = Math.min(
        round2(commissionBase * cbRate * sst),
        config.cashback_cap_incl_sst
      )
    }

    // AMS commission
    let ams_expected  = 0
    let ams_rate_used = 0
    if (order.ams_actual > 0) {
      const apiAmount = amsAmounts.get(order.order_sn)
      if (apiAmount !== undefined) {
        // API-sourced: order_brand_commission is PRE-SST; apply SST here to get the actual fee
        ams_expected  = round2(apiAmount * sst)
        ams_rate_used = commissionBase > 0 ? round2(apiAmount / commissionBase) : 0
      } else {
        // Fallback: config rate × base × SST (fixes previous bug where SST was omitted)
        ams_expected  = round2(commissionBase * config.ams_commission_rate * sst)
        ams_rate_used = config.ams_commission_rate
      }
    }

    // Diffs (positive = actual > expected = overcharged)
    const commission_diff         = round2(order.commission_actual         - commission_expected)
    const transaction_diff        = round2(order.transaction_actual        - transaction_expected)
    const platform_support_diff   = round2(order.platform_support_actual   - platform_support_expected)
    const cashback_diff           = round2(order.cashback_actual           - cashback_expected)
    const ams_diff                = round2(order.ams_actual                - ams_expected)
    const total_diff              = round2(commission_diff + transaction_diff + platform_support_diff + cashback_diff + ams_diff)

    const has_discrepancy = Math.abs(total_diff) > config.tolerance

    return {
      ...order,
      is_campaign_day:            isCampaign,
      commission_expected,
      transaction_expected,
      platform_support_expected,
      cashback_expected,
      ams_expected,
      ams_rate_used,
      commission_diff,
      transaction_diff,
      platform_support_diff,
      cashback_diff,
      ams_diff,
      total_diff,
      has_discrepancy,
    }
  })
}
