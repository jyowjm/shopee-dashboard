import { NextRequest, NextResponse } from 'next/server';
import { callShopee } from '@/lib/shopee';
import { fetchOrderSummaries, fetchEscrowBatch } from '@/lib/orders';
import { subOneMonthMyt } from '@/lib/datetime';
import { aggregateRevenue } from './helpers';
import type { ShopeeOrderDetail } from '@/types/shopee';
import type { ApiError } from '@/types/dashboard';

const BATCH_SIZE = 50;

async function fetchOrderDetails(orderSns: string[]): Promise<ShopeeOrderDetail[]> {
  const batches: string[][] = [];
  for (let i = 0; i < orderSns.length; i += BATCH_SIZE) {
    batches.push(orderSns.slice(i, i + BATCH_SIZE));
  }
  const responses = await Promise.all(
    batches.map((batch) =>
      callShopee<{ order_list: ShopeeOrderDetail[] }>('/api/v2/order/get_order_detail', {
        order_sn_list: batch.join(','),
        response_optional_fields: 'item_list,total_amount,order_status',
      }),
    ),
  );
  return responses.flatMap((r) => r.order_list ?? []);
}

async function fetchSellerVoucherMap(orderSns: string[]): Promise<Map<string, number>> {
  const items = await fetchEscrowBatch(orderSns);
  return new Map(items.map((i) => [i.order_sn, i.order_income.voucher_from_seller ?? 0]));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to = parseInt(searchParams.get('to') ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    // Previous period: month-aware for this_month/last_month, duration-shift for everything else
    const preset = searchParams.get('preset');
    let prevFrom: number;
    let prevTo: number;
    if (preset === 'this_month' || preset === 'last_month') {
      // e.g. Apr 1–Apr 8 → Mar 1–Mar 8 | Mar 1–Mar 31 → Feb 1–Feb 28
      prevFrom = subOneMonthMyt(from);
      prevTo = subOneMonthMyt(to);
    } else {
      const duration = to - from;
      prevFrom = from - duration;
      prevTo = from;
    }

    // Fetch current and previous period summaries in parallel
    const [{ orders, capped }, { orders: prevOrders }] = await Promise.all([
      fetchOrderSummaries(from, to),
      fetchOrderSummaries(prevFrom, prevTo),
    ]);

    const activeOrders = orders.filter((o) => !['CANCELLED', 'IN_CANCEL'].includes(o.order_status));
    const activePrevOrders = prevOrders.filter(
      (o) => !['CANCELLED', 'IN_CANCEL'].includes(o.order_status),
    );

    // Fetch order details for both periods in parallel
    const [details, prevDetails] = await Promise.all([
      fetchOrderDetails(activeOrders.map((o) => o.order_sn)),
      fetchOrderDetails(activePrevOrders.map((o) => o.order_sn)),
    ]);

    // Fetch seller vouchers for both periods in parallel — needed for apples-to-apples comparison
    const [sellerVouchers, prevSellerVouchers] = await Promise.all([
      fetchSellerVoucherMap(details.map((d) => d.order_sn)),
      fetchSellerVoucherMap(prevDetails.map((d) => d.order_sn)),
    ]);

    // Merge escrow voucher data into both periods
    const detailsWithVouchers = details.map((d) => ({
      ...d,
      voucher_from_seller: sellerVouchers.get(d.order_sn) ?? 0,
    }));

    const prevDetailsWithVouchers = prevDetails.map((d) => ({
      ...d,
      voucher_from_seller: prevSellerVouchers.get(d.order_sn) ?? 0,
    }));

    const result = aggregateRevenue(detailsWithVouchers);
    const prevResult = aggregateRevenue(prevDetailsWithVouchers);

    return NextResponse.json({
      ...result,
      capped,
      prev_total_revenue: prevResult.total_revenue,
      prev_order_count: activePrevOrders.length,
    });
  } catch (err) {
    const e = err as ApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
