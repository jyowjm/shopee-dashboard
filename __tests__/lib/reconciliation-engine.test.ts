import { reconcileOrders } from '@/lib/reconciliation-engine'
import { FEE_CONFIG } from '@/lib/fee-config'
import type { PayoutOrderRow, ReconOrderResult } from '@/types/reconciliation'

// Standard non-campaign order matching real payout report data
// seller_voucher=0, shipping_fee_by_buyer=0 → bases equal product_price so existing calcs hold
const baseOrder: PayoutOrderRow = {
  order_sn:               'TEST001',
  payout_date:            '2026-04-06',   // not a campaign day in FEE_CONFIG
  product_price:          64.60,
  seller_voucher:         0,
  shipping_fee_by_buyer:  0,
  payment_method:         'Online Banking',
  payment_installment:    '',
  amount_paid_by_buyer:   61.37,
  refund_amount:          0,
  order_type:             'Normal Order',
  commission_actual:      7.67,
  transaction_actual:     2.44,
  service_fee_actual:     4.38,
  platform_support_actual: 0.54,
  cashback_actual:        3.84,
  ams_actual:             0,
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

    it('applies SPayLater_12x rate (same as 1x) for 12x installments', () => {
      const splayOrder: PayoutOrderRow = {
        ...baseOrder,
        payment_method: 'SPayLater',
        payment_installment: '12x',
        transaction_actual: 3.14,
      }
      const [r] = reconcileOrders([splayOrder], FEE_CONFIG)
      // 64.60 × 4.5% × 1.08 = 3.14
      expect(r.transaction_expected).toBe(3.14)
    })
  })

  describe('fee bases with seller voucher and shipping', () => {
    it('subtracts seller_voucher from commission and cashback base', () => {
      const order: PayoutOrderRow = {
        ...baseOrder,
        product_price:       97.99,
        seller_voucher:       8.00,
        commission_actual:   10.69,   // 89.99 × 11% × 1.08 = 10.69
        cashback_actual:     5.35,    // 89.99 × 5.5% × 1.08 = 5.35
      }
      const [r] = reconcileOrders([order], FEE_CONFIG)
      expect(r.commission_expected).toBe(10.69)
      expect(r.cashback_expected).toBe(5.35)
    })

    it('adds shipping_fee_by_buyer to transaction fee base', () => {
      const order: PayoutOrderRow = {
        ...baseOrder,
        product_price:          252.96,
        seller_voucher:          20.00,
        shipping_fee_by_buyer:   13.00,
        // transaction base = 252.96 - 20 + 13 = 245.96 → × 4.86% = 11.95
        payment_method:         'SPayLater',
        payment_installment:    '1x',
        transaction_actual:     11.95,
      }
      const [r] = reconcileOrders([order], FEE_CONFIG)
      // 245.96 × 4.5% × 1.08 = 11.95
      expect(r.transaction_expected).toBe(11.95)
    })
  })

  describe('AMS commission', () => {
    it('calculates ams_expected with SST in fallback path (no amsAmounts)', () => {
      const amsOrder: PayoutOrderRow = { ...baseOrder, ams_actual: 2.09 }
      const [r] = reconcileOrders([amsOrder], FEE_CONFIG)
      // 64.60 × 3% × 1.08 = 2.09
      expect(r.ams_expected).toBe(2.09)
      expect(r.ams_rate_used).toBe(0.03)
      expect(r.ams_diff).toBe(0.00)
    })

    it('applies SST to amsAmounts (order_brand_commission is pre-SST)', () => {
      // Real example from AMS conversion report: order_brand_commission = 0.89424 (pre-SST)
      // Actual fee in payout = 0.89424 × 1.08 = 0.97
      const amsOrder: PayoutOrderRow = { ...baseOrder, ams_actual: 0.97 }
      const amsAmounts = new Map([['TEST001', 0.89424]])  // pre-SST from API
      const [r] = reconcileOrders([amsOrder], FEE_CONFIG, amsAmounts)
      // round2(0.89424 * 1.08) = round2(0.9657792) = 0.97
      expect(r.ams_expected).toBe(0.97)
      expect(r.ams_diff).toBe(0.00)
    })

    it('flags discrepancy when amsAmounts (pre-SST) × 1.08 differs from ams_actual', () => {
      // pre-SST = 0.89424 → incl-SST = 0.97, but charged 1.50 → diff = 0.53
      const amsOrder: PayoutOrderRow = { ...baseOrder, ams_actual: 1.50 }
      const amsAmounts = new Map([['TEST001', 0.89424]])
      const [r] = reconcileOrders([amsOrder], FEE_CONFIG, amsAmounts)
      expect(r.ams_diff).toBeCloseTo(0.53, 2)
      expect(r.has_discrepancy).toBe(true)
    })

    it('ignores amsAmounts entry when ams_actual is 0', () => {
      // baseOrder has ams_actual: 0
      const amsAmounts = new Map([['TEST001', 5.00]])  // should be ignored
      const [r] = reconcileOrders([baseOrder], FEE_CONFIG, amsAmounts)
      expect(r.ams_expected).toBe(0)
      expect(r.ams_rate_used).toBe(0)
    })
  })
})
