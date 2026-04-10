import { NextRequest, NextResponse } from 'next/server';
import { fetchTikTokOrderList, fetchTikTokOrderDetails } from '@/lib/tiktok-orders';
import type { TikTokApiError } from '@/types/tiktok';
import type { ProductData } from '@/types/shopee';

const CANCELLED_STATUSES = new Set(['CANCELLED', 'PARTIALLY_REFUNDED']);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to   = parseInt(searchParams.get('to')   ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const { orders: list } = await fetchTikTokOrderList(from, to, 500);
    const activeIds = list.filter(o => !CANCELLED_STATUSES.has(o.status)).map(o => o.id);
    const details   = await fetchTikTokOrderDetails(activeIds);

    const map = new Map<string, ProductData>();

    for (const o of details) {
      for (const item of o.line_items ?? []) {
        const productId = item.product_id;
        if (!productId) continue;
        const qty     = item.quantity ?? 0;
        const price   = parseFloat(item.sale_price ?? '0') || 0;
        const revenue = qty * price;
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
