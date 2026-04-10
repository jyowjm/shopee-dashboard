import { NextRequest, NextResponse } from 'next/server'
import { parsePayout } from '@/lib/payout-parser'
import { reconcileOrders } from '@/lib/reconciliation-engine'
import { fetchAmsConversionReport } from '@/lib/ams'
import { FEE_CONFIG } from '@/lib/fee-config'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'File must be a .xlsx payout report' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { meta, orders } = parsePayout(buffer)

    if (!orders.length) {
      return NextResponse.json({ error: 'No orders found in payout report' }, { status: 400 })
    }

    // Fetch AMS conversion report to get exact order_brand_commission per order.
    // Wrapped in try-catch so upload still works without Shopee API credentials.
    let amsAmounts: Map<string, number> = new Map()
    try {
      amsAmounts = await fetchAmsConversionReport(meta.period_from, meta.period_to)
    } catch (amsErr) {
      console.warn('AMS fetch skipped — falling back to default rate:', (amsErr as Error).message)
    }

    const results = reconcileOrders(orders, FEE_CONFIG, amsAmounts)
    const total_actual   = +results.reduce((s, r) => s + r.commission_actual + r.transaction_actual + r.platform_support_actual + r.cashback_actual + r.ams_actual, 0).toFixed(2)
    const total_expected = +results.reduce((s, r) => s + r.commission_expected + r.transaction_expected + r.platform_support_expected + r.cashback_expected + r.ams_expected, 0).toFixed(2)
    const total_diff     = +(total_actual - total_expected).toFixed(2)

    // Insert payout period
    const supabase = getSupabase()
    const { data: period, error: periodErr } = await supabase
      .from('payout_periods')
      .insert({
        period_from:    meta.period_from,
        period_to:      meta.period_to,
        source:         'xlsx',
        total_expected,
        total_actual,
        total_diff,
      })
      .select('id')
      .single()

    if (periodErr) throw periodErr

    // Insert payout orders (batch)
    const rows = results.map((r) => ({
      period_id:                  period.id,
      order_sn:                   r.order_sn,
      payout_date:                r.payout_date || null,
      product_price:              r.product_price,
      payment_method:             r.payment_method,
      payment_installment:        r.payment_installment,
      is_campaign_day:            r.is_campaign_day,
      commission_actual:          r.commission_actual,
      transaction_actual:         r.transaction_actual,
      platform_support_actual:    r.platform_support_actual,
      cashback_actual:            r.cashback_actual,
      ams_actual:                 r.ams_actual,
      commission_expected:        r.commission_expected,
      transaction_expected:       r.transaction_expected,
      platform_support_expected:  r.platform_support_expected,
      cashback_expected:          r.cashback_expected,
      ams_expected:               r.ams_expected,
      ams_rate_used:              r.ams_rate_used,
      commission_diff:            r.commission_diff,
      transaction_diff:           r.transaction_diff,
      platform_support_diff:      r.platform_support_diff,
      cashback_diff:              r.cashback_diff,
      ams_diff:                   r.ams_diff,
      total_diff:                 r.total_diff,
      has_discrepancy:            r.has_discrepancy,
    }))

    const { error: ordersErr } = await supabase.from('payout_orders').insert(rows)
    if (ordersErr) throw ordersErr

    return NextResponse.json({
      ok:              true,
      period_id:       period.id,
      period_from:     meta.period_from,
      period_to:       meta.period_to,
      orders_count:    results.length,
      discrepancies:   results.filter((r) => r.has_discrepancy).length,
      total_expected,
      total_actual,
      total_diff,
    })
  } catch (err) {
    console.error('reconciliation/upload error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
