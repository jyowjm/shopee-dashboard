import { NextRequest, NextResponse } from 'next/server';
import { fetchTikTokOrderList, fetchTikTokOrderDetails } from '@/lib/tiktok-orders';
import { subOneMonthMyt, toMytDate } from '@/lib/datetime';
import type { ApiError, RevenueData } from '@/types/dashboard';

// Orders where buyer has paid — exclude unpaid, on-hold, cancelled, and refunded
const EXCLUDED_STATUSES = new Set(['UNPAID', 'ON_HOLD', 'CANCELLED', 'PARTIALLY_REFUNDED']);

/**
 * Product Revenue = MSRP − seller discounts.
 * Platform discounts excluded (TikTok absorbs them).
 * Falls back to payment.sub_total if original_total_product_price is missing.
 */
function calcProductRevenue(o: {
  payment?: { original_total_product_price?: string; seller_discount?: string; sub_total?: string };
}): number {
  const original = parseFloat(o.payment?.original_total_product_price ?? '0') || 0;
  const sellerDiscount = parseFloat(o.payment?.seller_discount ?? '0') || 0;
  if (original > 0) return original - sellerDiscount;
  // Fallback: sub_total already has seller discounts applied
  return parseFloat(o.payment?.sub_total ?? '0') || 0;
}

/**
 * Shipping Revenue = buyer's paid shipping fee (net of platform shipping discounts).
 * TikTok's payment.shipping_fee already reflects the net amount the buyer paid.
 */
function calcShippingRevenue(o: { payment?: { shipping_fee?: string } }): number {
  return parseFloat(o.payment?.shipping_fee ?? '0') || 0;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to = parseInt(searchParams.get('to') ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const preset = searchParams.get('preset');
    let prevFrom: number;
    let prevTo: number;
    if (preset === 'this_month' || preset === 'last_month') {
      prevFrom = subOneMonthMyt(from);
      prevTo = subOneMonthMyt(to);
    } else {
      const duration = to - from;
      prevFrom = from - duration;
      prevTo = from;
    }

    const [{ orders: currentList, capped }, { orders: prevList }] = await Promise.all([
      fetchTikTokOrderList(from, to, 500),
      fetchTikTokOrderList(prevFrom, prevTo, 500),
    ]);

    const activeIds = currentList.filter((o) => !EXCLUDED_STATUSES.has(o.status)).map((o) => o.id);
    const activePrevIds = prevList.filter((o) => !EXCLUDED_STATUSES.has(o.status)).map((o) => o.id);

    const [details, prevDetails] = await Promise.all([
      fetchTikTokOrderDetails(activeIds),
      fetchTikTokOrderDetails(activePrevIds),
    ]);

    // Build daily revenue map capturing product and shipping components separately
    const dailyMap = new Map<string, { product: number; shipping: number }>();
    let totalProductRevenue = 0;
    let totalShippingRevenue = 0;
    const orderRows: RevenueData['orders'] = [];

    for (const o of details) {
      const product = calcProductRevenue(o);
      const shipping = calcShippingRevenue(o);
      const date = toMytDate(o.create_time);
      const prev = dailyMap.get(date) ?? { product: 0, shipping: 0 };
      dailyMap.set(date, { product: prev.product + product, shipping: prev.shipping + shipping });
      totalProductRevenue += product;
      totalShippingRevenue += shipping;
      orderRows.push({
        order_sn: o.id,
        date,
        status: o.status,
        amount: product,
        shipping_amount: shipping,
      });
    }

    const daily = Array.from(dailyMap.entries())
      .map(([date, { product, shipping }]) => ({
        date,
        revenue: product,
        shipping_revenue: shipping,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    orderRows.sort((a, b) => b.date.localeCompare(a.date));

    let prevTotalProductRevenue = 0;
    let prevTotalShippingRevenue = 0;
    for (const o of prevDetails) {
      prevTotalProductRevenue += calcProductRevenue(o);
      prevTotalShippingRevenue += calcShippingRevenue(o);
    }

    const result: RevenueData = {
      total_revenue: totalProductRevenue, // product only — keeps mergeRevenue working
      order_count: details.length,
      daily,
      orders: orderRows,
      capped,
      prev_total_revenue: prevTotalProductRevenue,
      prev_order_count: prevDetails.length,
      total_shipping_revenue: totalShippingRevenue,
      prev_total_shipping_revenue: prevTotalShippingRevenue,
    };

    return NextResponse.json(result);
  } catch (err) {
    const e = err as ApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
