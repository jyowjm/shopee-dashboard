import { NextRequest, NextResponse } from 'next/server';
import { callShopee } from '@/lib/shopee';
import { aggregateProducts } from './helpers';
import type { ShopeeOrderSummary, ShopeeOrderDetail, ShopeeApiError } from '@/types/shopee';

const ORDER_CAP = 500;
const BATCH_SIZE = 50;

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

    while (more && orders.length < ORDER_CAP) {
      const data = await callShopee<{ order_list: ShopeeOrderSummary[]; more: boolean; next_cursor: string }>(
        '/api/v2/order/get_order_list',
        {
          time_range_field: 'create_time',
          time_from: from,
          time_to: to,
          page_size: 100,
          ...(cursor ? { cursor } : {}),
        }
      );
      orders.push(...(data.order_list ?? []));
      more = data.more;
      cursor = data.next_cursor ?? '';
    }

    const sns = orders.slice(0, ORDER_CAP).map(o => o.order_sn);
    const details: ShopeeOrderDetail[] = [];
    for (let i = 0; i < sns.length; i += BATCH_SIZE) {
      const batch = sns.slice(i, i + BATCH_SIZE);
      const data = await callShopee<{ order_list: ShopeeOrderDetail[] }>(
        '/api/v2/order/get_order_detail',
        { order_sn_list: batch.join(','), response_optional_fields: 'item_list,total_amount' }
      );
      details.push(...(data.order_list ?? []));
    }

    return NextResponse.json({ products: aggregateProducts(details) });
  } catch (err) {
    const e = err as ShopeeApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
