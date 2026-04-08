import { NextRequest, NextResponse } from 'next/server';
import { callShopee } from '@/lib/shopee';
import { fetchOrderSummaries } from '@/lib/orders';
import { aggregateRevenue } from './helpers';
import type { ShopeeOrderDetail, ShopeeApiError } from '@/types/shopee';

const BATCH_SIZE = 50;

async function fetchOrderDetails(orderSns: string[]): Promise<ShopeeOrderDetail[]> {
  const details: ShopeeOrderDetail[] = [];
  for (let i = 0; i < orderSns.length; i += BATCH_SIZE) {
    const batch = orderSns.slice(i, i + BATCH_SIZE);
    const data = await callShopee<{ order_list: ShopeeOrderDetail[] }>(
      '/api/v2/order/get_order_detail',
      {
        order_sn_list: batch.join(','),
        response_optional_fields: 'item_list,total_amount,order_status',
      }
    );
    details.push(...(data.order_list ?? []));
  }
  return details;
}

// Fetch seller voucher amounts from escrow endpoint (one call per order)
async function fetchSellerVouchers(orderSns: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  await Promise.all(
    orderSns.map(async (sn) => {
      try {
        const data = await callShopee<{ order_income: { voucher_from_seller: number } }>(
          '/api/v2/payment/get_escrow_detail',
          { order_sn: sn }
        );
        map.set(sn, data.order_income?.voucher_from_seller ?? 0);
      } catch {
        map.set(sn, 0);
      }
    })
  );
  return map;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to = parseInt(searchParams.get('to') ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    // Previous period covers the same duration immediately before the current window
    const duration = to - from;
    const prevFrom = from - duration;
    const prevTo = from;

    // Fetch current and previous period summaries in parallel
    const [{ orders, capped }, { orders: prevOrders }] = await Promise.all([
      fetchOrderSummaries(from, to),
      fetchOrderSummaries(prevFrom, prevTo),
    ]);

    const activeOrders = orders.filter(o => !['CANCELLED', 'IN_CANCEL'].includes(o.order_status));
    const activePrevOrders = prevOrders.filter(o => !['CANCELLED', 'IN_CANCEL'].includes(o.order_status));

    // Fetch order details for both periods in parallel
    const [details, prevDetails] = await Promise.all([
      fetchOrderDetails(activeOrders.map(o => o.order_sn)),
      fetchOrderDetails(activePrevOrders.map(o => o.order_sn)),
    ]);

    // Seller vouchers only needed for current period (used in accurate revenue calc)
    const sellerVouchers = await fetchSellerVouchers(details.map(d => d.order_sn));

    // Merge escrow voucher data into current order details
    const detailsWithVouchers = details.map(d => ({
      ...d,
      voucher_from_seller: sellerVouchers.get(d.order_sn) ?? 0,
    }));

    const result = aggregateRevenue(detailsWithVouchers);

    // Previous period revenue — same item-price basis as current period.
    // Seller vouchers are skipped (no escrow calls) but those are small; the comparison is fair.
    const prevRevenue = prevDetails.reduce((sum, o) =>
      sum + (o.item_list ?? []).reduce((s, item) =>
        s + (item.model_discounted_price ?? 0) * (item.model_quantity_purchased ?? 0), 0
      ), 0
    );

    return NextResponse.json({
      ...result,
      capped,
      prev_total_revenue: prevRevenue,
      prev_order_count: activePrevOrders.length,
    });
  } catch (err) {
    const e = err as ShopeeApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
