import { NextResponse } from 'next/server';
import { callShopee } from '@/lib/shopee';
import { fetchOrderSummaries } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function GET() {
  const yesterday = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);

  const { orders } = await fetchOrderSummaries(yesterday, now, 1);
  if (orders.length === 0) return NextResponse.json({ message: 'No orders found' });

  const orderSn = orders[0].order_sn;

  // Try get_order_detail with every known financial optional field
  const detail = await callShopee<{ order_list: unknown[] }>(
    '/api/v2/order/get_order_detail',
    {
      order_sn_list: orderSn,
      response_optional_fields: [
        'item_list', 'total_amount', 'order_status',
        'voucher_from_seller', 'voucher_from_shopee',
        'seller_discount', 'buyer_paid_amount',
        'estimated_shipping_fee', 'actual_shipping_cost',
        'income_info', 'pay_time',
      ].join(','),
    }
  );

  // Also try the escrow detail endpoint
  let escrow: unknown = null;
  try {
    escrow = await callShopee(
      '/api/v2/payment/get_escrow_detail',
      { order_sn: orderSn }
    );
  } catch (e) {
    escrow = { error: (e as Error).message };
  }

  return NextResponse.json({ order_sn: orderSn, detail, escrow });
}
