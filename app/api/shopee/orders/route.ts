import { NextRequest, NextResponse } from 'next/server';
import { callShopee } from '@/lib/shopee';
import { aggregateOrders } from './helpers';
import type { ShopeeOrderSummary, ShopeeApiError } from '@/types/shopee';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to = parseInt(searchParams.get('to') ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const orders: ShopeeOrderSummary[] = [];
    let cursor = '';
    let more = true;

    while (more) {
      const data = await callShopee<{ order_list: ShopeeOrderSummary[]; more: boolean; next_cursor: string }>(
        '/api/v2/order/get_order_list',
        {
          time_range_field: 'create_time',
          time_from: from,
          time_to: to,
          page_size: 100,
          ...(cursor ? { cursor } : {}),
          order_status: 'ALL',
        }
      );
      orders.push(...(data.order_list ?? []));
      more = data.more;
      cursor = data.next_cursor ?? '';
    }

    return NextResponse.json(aggregateOrders(orders));
  } catch (err) {
    const e = err as ShopeeApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
