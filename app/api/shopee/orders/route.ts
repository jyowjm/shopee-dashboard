import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderSummaries } from '@/lib/orders';
import { aggregateOrders } from './helpers';
import type { ShopeeApiError } from '@/types/shopee';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to = parseInt(searchParams.get('to') ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const { orders } = await fetchOrderSummaries(from, to);
    return NextResponse.json(aggregateOrders(orders));
  } catch (err) {
    const e = err as ShopeeApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
