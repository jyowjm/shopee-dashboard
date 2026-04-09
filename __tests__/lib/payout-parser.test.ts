import * as xlsx from 'xlsx'
import { parsePayout } from '@/lib/payout-parser'
import type { PayoutOrderRow, PayoutPeriodMeta } from '@/types/reconciliation'

// Build a minimal in-memory XLSX buffer with the same structure as a real payout report
function buildTestXlsx(): Buffer {
  const wb = xlsx.utils.book_new()

  // Summary sheet — rows match actual report structure
  const summaryData = [
    ['Income Report', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
    ['Report Details', '', '', ''],
    ['Username (Seller)', 'test_seller', '', ''],
    ['Bank Account Name', 'Test Sdn Bhd', '', ''],
    ['Bank Account', '****1234', '', ''],
    ['Bank Name', 'MAYBANK', '', ''],
    ['From', '2026-04-01', '', ''],
    ['to', '2026-04-08', '', ''],
    ['', '', '', ''],
    ['Income Summary', '', '', 'RM'],
    ['1. Total Revenue', '', '', 6458.77],
    ['', '', '', ''],
    ['2. Total Expenses', '', '', -1503.87],
    ['', '', '', ''],
    ['3. Total Released Amount', '', '', 4954.90],
  ]
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(summaryData), 'Summary')

  // Income sheet — 3-row header + 2 order rows (1 Order-level, 1 Sku-level)
  const incomeData = [
    // Row 1: group headers
    ['Order Info', '', '', '', '', '', '', '', '', '', '', 'Released Amount Details', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Buyer Info', '', '', '', '', '', 'Reference Info', '', '', '', '', '', '', '', ''],
    // Row 2: sub-group headers
    ['', '', '', '', '', '', '', '', '', '', '', 'Order Income', 'Merchandise Subtotal', '', 'Shipping Subtotal', '', '', '', '', '', '', '', 'Vouchers and Rebates', '', '', '', '', 'Fees and Charges', '', '', '', '', '', '', '', '', '', '', '', 'Shipping', '', '', 'Promotion', 'Compensation', 'Refund Amount Breakdown', '', '', '', ''],
    // Row 3: column names
    [
      'Sequence No.', 'View By', 'Order ID', 'refund id', 'Product ID', 'Product Name',
      'Order Creation Date', 'Payout Completed Date', 'Release Channel', 'Order Type', 'Hot Listing',
      'Total Released Amount (RM)', 'Product Price', 'Refund Amount',
      'Shipping Fee Paid by Buyer (excl. SST)', 'Shipping Fee Charged by Logistic Provider',
      'Seller Paid Shipping Fee SST', 'Shipping Rebate From Shopee', 'Reverse Shipping Fee',
      'Reverse Shipping Fee SST', 'Saver Programme Shipping Fee Savings', 'Return to Seller Fee',
      'Rebate Provided by Shopee', 'Voucher Sponsored by Seller', 'Cofund Voucher Sponsored by Seller',
      'Coin Cashback Sponsored by Seller', 'Cofund Coin Cashback Sponsored by Seller',
      'Commission Fee (incl. SST)', 'Service Fee (Incl. SST)', 'Transaction Fee (Incl. SST)',
      'AMS Commission Fee', 'Saver Programme Fee (Incl. SST)', 'Ads Escrow Top Up Fee',
      'Username (Buyer)', 'Amount Paid By Buyer', 'Transaction Fee Rate (%)',
      'Buyer Payment Method', 'Buyer Payment Method Details_1(if applicable)', 'Payment Details / Installment Plan',
      'Shipping Fee Promotion by Seller', 'Shipping provider', 'Courier Name',
      'Voucher Code From Seller', 'Lost Compensation', 'Cash refund to buyer amount',
      'Pro-rated coin offset for return refund Items', 'Pro-rated Shopee voucher offset for returned items',
      'Pro-rated Bank Payment Channel Promotion  for return refund Items',
      'Pro-rated Shopee Payment Channel Promotion  for return refund Items',
    ],
    // Row 4: Order-level row
    [
      1, 'Order', 'TEST001', '', '-', '-',
      '2026-04-06', '2026-04-08', 'Seller Wallet', 'Normal Order', 'NO',
      50.11, 64.6, 0,
      0, -4.9,
      0, 4.9, 0,
      0, 0, 0,
      0, 0, 0,
      0, 0,
      -7.67, -4.38, -2.44,
      0, '0.00', 0,
      'buyer1', 61.37, 3.78,
      'Online Banking', '', '',
      '0.00', '2-Day Delivery', 'SPX Express (2DD)',
      '', '0.00', '0.00',
      '0.00', '0.00',
      '0.00', '0.00',
    ],
    // Row 5: Sku-level row — should be IGNORED by parser
    [
      2, 'Sku', 'TEST001', '-', '123456', 'Test Product',
      '2026-04-06', '2026-04-08', 'Seller Wallet', 'Normal Order', 'NO',
      50.11, 64.6, 0,
      0, -4.9, 0, 4.9, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      -7.67, -4.38, -2.44,
      0, '-', 0,
      '', '-', '-', 'Online Banking', '', '-',
      '-', '2-Day Delivery', 'SPX Express (2DD)',
      '', '-', '-', '-', '-', '-', '-',
    ],
  ]
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(incomeData), 'Income')

  // Service Fee Details sheet
  const serviceFeeData = [
    ['', '', 'Service Fee (Incl. SST)', ''],
    ['Sequence No.', 'Order ID', 'Cashback Programme', 'Platform Support Fee'],
    [1, 'TEST001', -3.84, -0.54],
  ]
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(serviceFeeData), 'Service Fee Details')

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('parsePayout()', () => {
  let buffer: Buffer
  let result: { meta: PayoutPeriodMeta; orders: PayoutOrderRow[] }

  beforeAll(() => {
    buffer = buildTestXlsx()
    result = parsePayout(buffer)
  })

  describe('period metadata', () => {
    it('extracts period_from from Summary sheet', () => {
      expect(result.meta.period_from).toBe('2026-04-01')
    })

    it('extracts period_to from Summary sheet', () => {
      expect(result.meta.period_to).toBe('2026-04-08')
    })

    it('extracts total_released from Summary sheet', () => {
      expect(result.meta.total_released).toBe(4954.90)
    })
  })

  describe('order parsing', () => {
    it('returns exactly one order (Sku rows are excluded)', () => {
      expect(result.orders).toHaveLength(1)
    })

    it('maps order_sn correctly', () => {
      expect(result.orders[0].order_sn).toBe('TEST001')
    })

    it('maps payout_date from Payout Completed Date', () => {
      expect(result.orders[0].payout_date).toBe('2026-04-08')
    })

    it('maps product_price correctly', () => {
      expect(result.orders[0].product_price).toBe(64.6)
    })

    it('maps payment_method correctly', () => {
      expect(result.orders[0].payment_method).toBe('Online Banking')
    })

    it('maps commission_actual as positive absolute value', () => {
      expect(result.orders[0].commission_actual).toBe(7.67)
    })

    it('maps transaction_actual as positive absolute value', () => {
      expect(result.orders[0].transaction_actual).toBe(2.44)
    })

    it('maps service_fee_actual as positive absolute value', () => {
      expect(result.orders[0].service_fee_actual).toBe(4.38)
    })
  })

  describe('Service Fee Details join', () => {
    it('sets platform_support_actual from Service Fee Details sheet', () => {
      expect(result.orders[0].platform_support_actual).toBe(0.54)
    })

    it('derives cashback_actual as service_fee_actual - platform_support_actual', () => {
      expect(result.orders[0].cashback_actual).toBeCloseTo(3.84, 2)
    })
  })
})
