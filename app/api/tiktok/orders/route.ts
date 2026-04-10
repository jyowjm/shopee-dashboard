import { NextRequest, NextResponse } from 'next/server';
import { fetchTikTokOrderList } from '@/lib/tiktok-orders';
import type { TikTokApiError } from '@/types/tiktok';
import type { OrdersData } from '@/types/shopee';

// Map TikTok statuses to the same display labels used for Shopee
const STATUS_MAP: Record<string, string> = {
  UNPAID:              'UNPAID',
  ON_HOLD:             'UNPAID',
  AWAITING_SHIPMENT:   'READY_TO_SHIP',
  AWAITING_COLLECTION: 'READY_TO_SHIP',
  IN_TRANSIT:          'SHIPPED',
  DELIVERED:           'COMPLETED',
  COMPLETED:           'COMPLETED',
  CANCELLED:           'CANCELLED',
  PARTIALLY_REFUNDED:  'TO_RETURN',
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to   = parseInt(searchParams.get('to')   ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const { orders } = await fetchTikTokOrderList(from, to);

    const by_status: Record<string, number> = {};
    for (const o of orders) {
      const mapped = STATUS_MAP[o.status] ?? o.status;
      by_status[mapped] = (by_status[mapped] ?? 0) + 1;
    }

    const result: OrdersData = { total: orders.length, by_status };
    return NextResponse.json(result);
  } catch (err) {
    const e = err as TikTokApiError;
    if (e.type === 'auth')       return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
