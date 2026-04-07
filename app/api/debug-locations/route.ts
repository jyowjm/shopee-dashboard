import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = parseInt(searchParams.get('from') ?? '0', 10);
  const to = parseInt(searchParams.get('to') ?? '0', 10);
  const fromDate = from ? new Date(from * 1000).toISOString() : undefined;
  const toDate = to ? new Date(to * 1000).toISOString() : undefined;

  const supabase = getSupabase();

  // Total paid orders in period
  let q = supabase.from('orders').select('order_sn, recipient_state, data_source, is_paid_order, create_time', { count: 'exact' }).eq('is_paid_order', true);
  if (fromDate) q = q.gte('create_time', fromDate);
  if (toDate) q = q.lte('create_time', toDate);
  const { data: orders, count } = await q.limit(20);

  // Count orders with non-null, non-masked state
  let q2 = supabase.from('orders').select('recipient_state', { count: 'exact' }).eq('is_paid_order', true).not('recipient_state', 'is', null);
  if (fromDate) q2 = q2.gte('create_time', fromDate);
  if (toDate) q2 = q2.lte('create_time', toDate);
  const { count: stateCount } = await q2;

  return NextResponse.json({
    period: { from: fromDate, to: toDate },
    total_paid_orders_in_period: count,
    orders_with_state: stateCount,
    sample_orders: orders?.slice(0, 10).map(o => ({
      order_sn: o.order_sn,
      recipient_state: o.recipient_state,
      data_source: o.data_source,
      create_time: o.create_time,
    })),
  });
}
