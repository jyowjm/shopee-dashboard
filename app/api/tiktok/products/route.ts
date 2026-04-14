import { NextRequest, NextResponse } from 'next/server';
import { fetchTikTokOrderList, fetchTikTokOrderDetails } from '@/lib/tiktok-orders';
import type { TikTokApiError, TikTokOrderDetail } from '@/types/tiktok';
import type { ProductData } from '@/types/shopee';

// Match the revenue route exactly — only count orders where payment was received
const EXCLUDED_STATUSES = new Set(['UNPAID', 'ON_HOLD', 'CANCELLED', 'PARTIALLY_REFUNDED']);

/**
 * Product Revenue = MSRP − seller discounts.
 * Mirrors calcProductRevenue in revenue/route.ts exactly.
 */
function calcProductRevenue(o: TikTokOrderDetail): number {
  const original      = parseFloat(o.payment?.original_total_product_price ?? '0') || 0;
  const sellerDiscount = parseFloat(o.payment?.seller_discount ?? '0') || 0;
  if (original > 0) return original - sellerDiscount;
  return parseFloat(o.payment?.sub_total ?? '0') || 0;
}

/**
 * Shipping Revenue = buyer's paid shipping fee.
 * Mirrors calcShippingRevenue in revenue/route.ts exactly.
 */
function calcShippingRevenue(o: TikTokOrderDetail): number {
  return parseFloat(o.payment?.shipping_fee ?? '0') || 0;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to   = parseInt(searchParams.get('to')   ?? '0', 10);
    const includeShipping = searchParams.get('includeShipping') === 'true';

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const { orders: list } = await fetchTikTokOrderList(from, to, 500);
    const activeIds = list
      .filter(o => !EXCLUDED_STATUSES.has(o.status))
      .map(o => o.id);
    const details = await fetchTikTokOrderDetails(activeIds);

    const map = new Map<string, ProductData>();

    for (const order of details) {
      const items = order.line_items ?? [];
      if (items.length === 0) continue;

      // Use the same revenue formula as the Revenue section so totals are consistent.
      // Allocate equally across line items (each is 1 unit; no per-item price breakdown).
      const productRev  = calcProductRevenue(order);
      const shippingRev = includeShipping ? calcShippingRevenue(order) : 0;
      const perItemRev  = (productRev + shippingRev) / items.length;

      for (const item of items) {
        const productId = item.product_id;
        if (!productId) continue;

        const qty      = item.quantity ?? 1;   // each line_item = 1 unit
        const revenue  = perItemRev * qty;

        const existing = map.get(productId);
        if (existing) {
          existing.units_sold += qty;
          existing.revenue    += revenue;
        } else {
          map.set(productId, {
            item_id:    parseInt(productId, 10) || 0,
            name:       item.product_name ?? '',
            units_sold: qty,
            revenue,
          });
        }
      }
    }

    const products = Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return NextResponse.json({ products });
  } catch (err) {
    const e = err as TikTokApiError;
    if (e.type === 'auth')       return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
