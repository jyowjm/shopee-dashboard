import { NextRequest, NextResponse } from 'next/server';
import { fetchTikTokOrderList, mapStatus } from '@/lib/tiktok-orders';
import type { ApiError, OrdersData } from '@/types/dashboard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to = parseInt(searchParams.get('to') ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const { orders } = await fetchTikTokOrderList(from, to);

    const by_status: Record<string, number> = {};
    for (const o of orders) {
      const mapped = mapStatus(o.status);
      by_status[mapped] = (by_status[mapped] ?? 0) + 1;
    }

    const result: OrdersData = { total: orders.length, by_status };
    return NextResponse.json(result);
  } catch (err) {
    const e = err as ApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
