import { callAmsShopee } from '@/lib/ams-shopee'

interface AmsConversionOrder {
  order_sn:               string
  order_brand_commission: string  // RM as string, e.g. "12.34"
  order_type:             string  // "Direct Order" | "Indirect Order"
}

/** Convert a YYYY-MM-DD date (Malaysia time, UTC+8) to start-of-day Unix timestamp */
function toMytUnixStart(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00+08:00`).getTime() / 1000)
}

/** Convert a YYYY-MM-DD date (Malaysia time, UTC+8) to end-of-day Unix timestamp */
function toMytUnixEnd(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T23:59:59+08:00`).getTime() / 1000)
}

/**
 * Fetch AMS commission amounts for a payout period via get_conversion_report.
 *
 * Returns Map<order_sn, order_brand_commission (RM)>.
 * The order_brand_commission value is the exact amount charged by Shopee,
 * already inclusive of SST and the direct/indirect-order 30% multiplier.
 *
 * Filters to OrderEscrow + Deducted entries to match what appears in the
 * payout report's "AMS Commission Fee" column.
 *
 * Throws if Shopee API credentials are unavailable (caller should catch for
 * graceful fallback in the XLSX upload path).
 */
export async function fetchAmsConversionReport(
  periodFrom: string,  // YYYY-MM-DD (MYT)
  periodTo:   string,  // YYYY-MM-DD (MYT)
): Promise<Map<string, number>> {
  const result   = new Map<string, number>()
  const startTs  = toMytUnixStart(periodFrom)
  const endTs    = toMytUnixEnd(periodTo)
  let   pageNo   = 1

  while (true) {
    const res = await callAmsShopee<{
      list:        AmsConversionOrder[]
      has_more:    boolean
      total_count: number
    }>('/api/v2/ams/get_conversion_report', {
      page_no:                  pageNo,
      page_size:                500,
      ams_deduction_time_start: startTs,
      ams_deduction_time_end:   endTs,
      deduction_status:         'Deducted',
      deduction_method:         'OrderEscrow',
    })

    for (const order of (res.list ?? [])) {
      const amount = parseFloat(order.order_brand_commission)
      if (!isNaN(amount)) result.set(order.order_sn, amount)
    }

    if (!res.has_more) break
    pageNo++
  }

  return result
}
