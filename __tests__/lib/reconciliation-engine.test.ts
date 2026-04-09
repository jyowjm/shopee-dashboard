import { reconcileOrders } from '@/lib/reconciliation-engine'
import { FEE_CONFIG } from '@/lib/fee-config'
import type { PayoutOrderRow, ReconOrderResult } from '@/types/reconciliation'

// Standard non-campaign order matching real payout report data
const baseOrder: PayoutOrderRow = {
  order_sn:             'TEST001',
  payout_date:          '2026-04-06',   // not a campaign day in FEE_CONFIG
  product_price:        64.60,
  payment_method:       'Online Banking',
  payment_installment:  '',
  amount_paid_by_buyer: 61.37,
  refund_amount:        0,
  order_type:           'Normal Order',
  commission_actual:    7.67,
  transaction_actual:   2.44,
  service_fee_actual:   4.38,
  platform_support_actual: 0.54,
  cashback_actual:      3.84,
  ams_actual:           0,
}

describe('reconcileOrders()', () => {
  let results: ReconOrderResult[]

  beforeAll(() => {
    results = reconcileOrders([baseOrder], FEE_CONFIG)
  })

  it('returns one result per input order', () => {
    expect(results).toHaveLength(1)
  })

  it('is_campaign_day is false for a non-campaign date', () => {
    expect(results[0].is_campaign_day).toBe(false)
  })

  describe('commission', () => {
    it('calculates commission_expected = 64.60 × 11% × 1.08 = 7.67', () => {
      expect(results[0].commission_expected).toBe(7.67)
    })

    it('commission_diff is 0.00 (no discrepancy)', () => {
      expect(results[0].commission_diff).toBe(0.00)
    })
  })

  describe('transaction fee', () => {
    it('calculates transaction_expected = 64.60 × 3.5% × 1.08 = 2.44', () => {
      expect(results[0].transaction_expected).toBe(2.44)
    })

    it('transaction_diff is 0.00', () => {
      expect(results[0].transaction_diff).toBe(0.00)
    })
  })

  describe('platform support fee', () => {
    it('platform_support_expected = 0.54 (flat fee)', () => {
      expect(results[0].platform_support_expected).toBe(0.54)
    })

    it('platform_support_diff is 0.00', () => {
      expect(results[0].platform_support_diff).toBe(0.00)
    })
  })

  describe('cashback programme fee', () => {
    it('cashback_expected = 64.60 × 5.5% × 1.08 = 3.84 on non-campaign day', () => {
      expect(results[0].cashback_expected).toBe(3.84)
    })

    it('cashback_diff is 0.00', () => {
      expect(results[0].cashback_diff).toBe(0.00)
    })
  })

  describe('discrepancy detection', () => {
    it('has_discrepancy is false when all diffs are within tolerance', () => {
      expect(results[0].has_discrepancy).toBe(false)
    })

    it('has_discrepancy is true when commission diff exceeds tolerance', () => {
      const overchargedOrder: PayoutOrderRow = { ...baseOrder, commission_actual: 8.50 }
      const [r] = reconcileOrders([overchargedOrder], FEE_CONFIG)
      expect(r.has_discrepancy).toBe(true)
      expect(r.commission_diff).toBeCloseTo(0.83, 2)
    })
  })

  describe('campaign day', () => {
    it('uses cashback_rate_campaign on a campaign day', () => {
      const campaignOrder: PayoutOrderRow = { ...baseOrder, payout_date: '2026-04-04' } // 4.4 double-digit
      const [r] = reconcileOrders([campaignOrder], FEE_CONFIG)
      expect(r.is_campaign_day).toBe(true)
      // 64.60 × 7.5% × 1.08 = 5.23
      expect(r.cashback_expected).toBe(5.23)
    })
  })

  describe('SPayLater installment rates', () => {
    it('applies SPayLater_3x rate for 3x installments', () => {
      const splayOrder: PayoutOrderRow = {
        ...baseOrder,
        payment_method: 'SPayLater',
        payment_installment: '3x',
        transaction_actual: 3.49,
      }
      const [r] = reconcileOrders([splayOrder], FEE_CONFIG)
      // 64.60 × 5.0% × 1.08 = 3.49
      expect(r.transaction_expected).toBe(3.49)
    })
  })

  describe('AMS commission', () => {
    it('calculates ams_expected when ams_actual > 0 and ams rate provided', () => {
      const amsOrder: PayoutOrderRow = { ...baseOrder, ams_actual: 1.94 }
      const amsRates = new Map([['TEST001', 0.03]])
      const [r] = reconcileOrders([amsOrder], FEE_CONFIG, amsRates)
      // 64.60 × 3% = 1.94
      expect(r.ams_expected).toBe(1.94)
      expect(r.ams_rate_used).toBe(0.03)
    })
  })
})
