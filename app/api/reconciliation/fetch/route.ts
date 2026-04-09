import { NextRequest, NextResponse } from 'next/server'
import { callShopee, loadTokensOrThrow } from '@/lib/shopee'
import { normaliseEscrowOrder } from '@/lib/payout-parser'
import { reconcileOrders } from '@/lib/reconciliation-engine'
import { FEE_CONFIG } from '@/lib/fee-config'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const MAX_CHUNK_DAYS = 13  // API max is 14 days; use 13 to be safe
const ESCROW_BATCH_SIZE = 20

/** Split a date range into ≤13-day chunks, returning [from, to] Unix timestamps */
function chunkDateRange(fromDate: string, toDate: string): [number, number][] {
  const chunks: [number, number][] = []
  let cursor = new Date(fromDate)
  const end = new Date(toDate)
  end.setHours(23, 59, 59)

  while (cursor <= end) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setDate(chunkEnd.getDate() + MAX_CHUNK_DAYS)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())

    chunks.push([
      Math.floor(cursor.getTime() / 1000),
      Math.floor(chunkEnd.getTime() / 1000),
    ])
    cursor = new Date(chunkEnd)
    cursor.setDate(cursor.getDate() + 1)
  }

  return chunks
}

/** Fetch all released order SNs for a period via get_income_detail */
async function fetchOrderSns(fromTs: number, toTs: number, shopId: number): Promise<string[]> {
  const sns: string[] = []
  let cursor = ''

  while (true) {
    const params: Record<string, string | number> = {
      shop_id:             shopId,
      release_time_from:   fromTs,
      release_time_to:     toTs,
      income_type:         1,   // 1 = Released
      page_size:           100,
    }
    if (cursor) params.cursor = cursor

    const res = await callShopee<{
      response: {
        income_list: { order_sn: string }[]
        next_cursor: string
        has_next_page: boolean
      }
    }>('/api/v2/payment/get_income_detail', params)

    const list = res.response?.income_list ?? []
    sns.push(...list.map((o) => o.order_sn))

    if (!res.response?.has_next_page) break
    cursor = res.response.next_cursor
  }

  return [...new Set(sns)]
}

/** Fetch fee breakdown for a batch of order SNs via get_escrow_detail_batch */
async function fetchEscrowBatch(sns: string[], shopId: number) {
  const res = await callShopee<{
    response: {
      result_list: {
        order_sn: string
        escrow_detail: {
          order_income: {
            buyer_total_amount: number
            commission_fee: number
            service_fee: number
            seller_transaction_fee: number
            ams_commission_fee?: number
            escrow_amount: number
            voucher_from_seller?: number
          }
          release_time?: number
        }
      }[]
    }
  }>('/api/v2/payment/get_escrow_detail_batch', {
    shop_id:          shopId,
    order_sn_list:    sns.join(','),
  })

  return res.response?.result_list ?? []
}

export async function POST(req: NextRequest) {
  try {
    const { from_date, to_date } = await req.json() as { from_date: string; to_date: string }

    if (!from_date || !to_date) {
      return NextResponse.json({ error: 'from_date and to_date required (YYYY-MM-DD)' }, { status: 400 })
    }

    const tokens = await loadTokensOrThrow()
    const shopId = tokens.shop_id
    const chunks = chunkDateRange(from_date, to_date)

    // Collect all order SNs across chunks
    const allSns: string[] = []
    for (const [fromTs, toTs] of chunks) {
      const sns = await fetchOrderSns(fromTs, toTs, shopId)
      allSns.push(...sns)
    }
    const uniqueSns = [...new Set(allSns)]

    if (!uniqueSns.length) {
      return NextResponse.json({ error: 'No released orders found for this period' }, { status: 404 })
    }

    // Fetch escrow details in batches of 20
    const escrowResults: ReturnType<typeof normaliseEscrowOrder>[] = []
    for (let i = 0; i < uniqueSns.length; i += ESCROW_BATCH_SIZE) {
      const batch = uniqueSns.slice(i, i + ESCROW_BATCH_SIZE)
      const batchResults = await fetchEscrowBatch(batch, shopId)
      for (const item of batchResults) {
        if (!item.escrow_detail) continue
        const income = item.escrow_detail.order_income
        escrowResults.push(normaliseEscrowOrder({
          order_sn:                    item.order_sn,
          release_time:                item.escrow_detail.release_time,
          buyer_total_amount:          income.buyer_total_amount,
          commission_fee:              income.commission_fee,
          service_fee:                 income.service_fee,
          seller_transaction_fee:      income.seller_transaction_fee,
          ams_commission_fee:          income.ams_commission_fee,
          original_cost_of_goods_sold: income.buyer_total_amount,
        }))
      }
    }

    const results = reconcileOrders(escrowResults, FEE_CONFIG)
    const total_actual   = +results.reduce((s, r) => s + r.commission_actual + r.transaction_actual + r.platform_support_actual + r.cashback_actual + r.ams_actual, 0).toFixed(2)
    const total_expected = +results.reduce((s, r) => s + r.commission_expected + r.transaction_expected + r.platform_support_expected + r.cashback_expected + r.ams_expected, 0).toFixed(2)
    const total_diff     = +(total_actual - total_expected).toFixed(2)

    const supabase = getSupabase()
    const { data: period, error: periodErr } = await supabase
      .from('payout_periods')
      .insert({ period_from: from_date, period_to: to_date, source: 'api', total_expected, total_actual, total_diff })
      .select('id')
      .single()
    if (periodErr) throw periodErr

    const rows = results.map((r) => ({
      period_id: period.id, order_sn: r.order_sn,
      payout_date: r.payout_date || null,
      product_price: r.product_price, payment_method: r.payment_method,
      payment_installment: r.payment_installment, is_campaign_day: r.is_campaign_day,
      commission_actual: r.commission_actual, transaction_actual: r.transaction_actual,
      platform_support_actual: r.platform_support_actual, cashback_actual: r.cashback_actual,
      ams_actual: r.ams_actual,
      commission_expected: r.commission_expected, transaction_expected: r.transaction_expected,
      platform_support_expected: r.platform_support_expected, cashback_expected: r.cashback_expected,
      ams_expected: r.ams_expected, ams_rate_used: r.ams_rate_used,
      commission_diff: r.commission_diff, transaction_diff: r.transaction_diff,
      platform_support_diff: r.platform_support_diff, cashback_diff: r.cashback_diff,
      ams_diff: r.ams_diff, total_diff: r.total_diff, has_discrepancy: r.has_discrepancy,
    }))

    const { error: ordersErr } = await supabase.from('payout_orders').insert(rows)
    if (ordersErr) throw ordersErr

    return NextResponse.json({
      ok: true, period_id: period.id,
      period_from: from_date, period_to: to_date,
      orders_count: results.length,
      discrepancies: results.filter((r) => r.has_discrepancy).length,
      total_expected, total_actual, total_diff,
    })
  } catch (err) {
    console.error('reconciliation/fetch error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
