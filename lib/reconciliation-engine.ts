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
 * @param orders    - Normalised payout order rows (actuals from report/API)
 * @param config    - Fee rate configuration from lib/fee-config.ts
 * @param amsRates  - Optional map of order_sn → AMS commission rate (from AMS API)
 */
export function reconcileOrders(
  orders: PayoutOrderRow[],
  config: FeeConfig,
  amsRates: Map<string, number> = new Map()
): ReconOrderResult[] {
  return orders.map((order) => {
    const base = order.product_price
    const isCampaign = (config.campaign_days as readonly string[]).includes(order.payout_date)
    const sst = 1 + config.sst_rate

    // Commission
    const commission_expected = round2(base * config.marketplace_commission_rate * sst)

    // Transaction fee
    const txRate = getTransactionRate(order.payment_method, order.payment_installment, config)
    const transaction_expected = round2(base * txRate * sst)

    // Platform support (flat fee)
    const platform_support_expected = config.platform_support_fee

    // Cashback programme fee
    let cashback_expected = 0
    if (config.cashback_enrolled) {
      const cbRate = isCampaign ? config.cashback_rate_campaign : config.cashback_rate_non_campaign
      cashback_expected = Math.min(
        round2(base * cbRate * sst),
        config.cashback_cap_incl_sst
      )
    }

    // AMS commission
    const amsRate = order.ams_actual > 0
      ? (amsRates.get(order.order_sn) ?? config.ams_commission_rate)
      : 0
    const ams_expected = order.ams_actual > 0 ? round2(base * amsRate) : 0

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
      ams_rate_used:              amsRate,
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
