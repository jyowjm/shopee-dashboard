import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, paginateAll } from '@/lib/supabase';
import { aggregateTopLocations } from '@/lib/states';
import type { ApiError, CustomerData } from '@/types/dashboard';

// Customer stats are derived from the orders table filtered by platform='tiktok'.
// TikTok has no BIGINT buyer_user_id; tiktok_buyer_uid is the unique identity,
// with buyer_username as a less reliable fallback.

interface TikTokPaidOrderRow {
  tiktok_buyer_uid: string | null;
  buyer_username: string | null;
  total_amount: number | null;
  recipient_state: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to = parseInt(searchParams.get('to') ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const fromDate = new Date(from * 1000).toISOString();
    const toDate = new Date(to * 1000).toISOString();

    const supabase = getSupabase();
    const rows = await paginateAll<TikTokPaidOrderRow>((rangeFrom, rangeTo) =>
      supabase
        .from('orders')
        .select('tiktok_buyer_uid, buyer_username, total_amount, recipient_state')
        .eq('platform', 'tiktok')
        .eq('is_paid_order', true)
        .gte('create_time', fromDate)
        .lte('create_time', toDate)
        .range(rangeFrom, rangeTo),
    );

    const topLocations = aggregateTopLocations(rows.map((r) => r.recipient_state));
    const ordersWithState = rows.filter((r) => r.recipient_state).length;

    // Use tiktok_buyer_uid as primary identity; fall back to buyer_username
    const byBuyer = new Map<string, { orderCount: number; totalSpend: number }>();
    for (const r of rows) {
      const key = r.tiktok_buyer_uid ?? r.buyer_username ?? 'unknown';
      const prev = byBuyer.get(key) ?? { orderCount: 0, totalSpend: 0 };
      byBuyer.set(key, {
        orderCount: prev.orderCount + 1,
        totalSpend: prev.totalSpend + (r.total_amount ?? 0),
      });
    }

    const total = byBuyer.size;
    const totalPaidOrders = rows.length;

    if (total === 0) {
      return NextResponse.json({
        total_unique_customers: 0,
        new_customers: 0,
        existing_customers: 0,
        repeat_purchase_rate: 0,
        avg_orders_per_customer: 0,
        avg_spend_per_customer: 0,
        top_locations: topLocations,
        capped: false,
        location_coverage: {
          orders_with_state: ordersWithState,
          total_paid_orders: totalPaidOrders,
        },
      } satisfies CustomerData);
    }

    // "New" = uid first appeared within this period.
    // We approximate by fetching earliest create_time per tiktok_buyer_uid from history.
    const buyerUids = [...byBuyer.keys()].filter((k) => k !== 'unknown');
    let newCustomers = 0;

    if (buyerUids.length > 0) {
      const earliestRows = await paginateAll<{
        tiktok_buyer_uid: string | null;
        create_time: string;
      }>((rangeFrom, rangeTo) =>
        supabase
          .from('orders')
          .select('tiktok_buyer_uid, create_time')
          .eq('platform', 'tiktok')
          .eq('is_paid_order', true)
          .in('tiktok_buyer_uid', buyerUids)
          .order('create_time', { ascending: true })
          .range(rangeFrom, rangeTo),
      );

      const firstSeen = new Map<string, string>();
      for (const row of earliestRows) {
        if (row.tiktok_buyer_uid && !firstSeen.has(row.tiktok_buyer_uid)) {
          firstSeen.set(row.tiktok_buyer_uid, row.create_time);
        }
      }

      newCustomers = buyerUids.filter((uid) => {
        const fp = firstSeen.get(uid);
        return fp ? fp >= fromDate : false;
      }).length;
    }

    const values = [...byBuyer.values()];
    const repeatBuyers = values.filter((v) => v.orderCount >= 2).length;

    const result: CustomerData = {
      total_unique_customers: total,
      new_customers: newCustomers,
      existing_customers: total - newCustomers,
      repeat_purchase_rate: (repeatBuyers / total) * 100,
      avg_orders_per_customer: values.reduce((s, v) => s + v.orderCount, 0) / total,
      avg_spend_per_customer: values.reduce((s, v) => s + v.totalSpend, 0) / total,
      top_locations: topLocations,
      capped: false,
      location_coverage: { orders_with_state: ordersWithState, total_paid_orders: totalPaidOrders },
    };

    return NextResponse.json(result);
  } catch (err) {
    const e = err as ApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
