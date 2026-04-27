import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, paginateAll } from '@/lib/supabase';
import { aggregateTopLocations } from '@/lib/states';
import type { CustomerData, ApiError } from '@/types/dashboard';

interface ShopeePaidOrderRow {
  buyer_user_id: number | null;
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
    const rows = await paginateAll<ShopeePaidOrderRow>((rangeFrom, rangeTo) =>
      supabase
        .from('orders')
        .select('buyer_user_id, total_amount, recipient_state')
        .eq('is_paid_order', true)
        .gte('create_time', fromDate)
        .lte('create_time', toDate)
        .range(rangeFrom, rangeTo),
    );

    // Top locations — from all paid orders, including report-only rows where buyer_user_id is null
    const topLocations = aggregateTopLocations(rows.map((r) => r.recipient_state));
    const ordersWithState = rows.filter((r) => r.recipient_state).length;

    // Per-buyer aggregates — restricted to rows with a known buyer_user_id
    const byBuyer = new Map<number, { orderCount: number; totalSpend: number }>();
    for (const r of rows) {
      if (!r.buyer_user_id) continue;
      const prev = byBuyer.get(r.buyer_user_id) ?? { orderCount: 0, totalSpend: 0 };
      byBuyer.set(r.buyer_user_id, {
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

    // Look up first_paid_at for all buyers seen in this period
    const buyerIds = [...byBuyer.keys()];
    const { data: buyerRows, error: bErr } = await supabase
      .from('buyers')
      .select('buyer_user_id, first_paid_at')
      .in('buyer_user_id', buyerIds);
    if (bErr) throw new Error(bErr.message);

    const firstPaidAt = new Map<number, string>();
    for (const b of buyerRows ?? []) {
      if (b.first_paid_at) firstPaidAt.set(b.buyer_user_id, b.first_paid_at);
    }

    const newCustomers = buyerIds.filter((id) => {
      const fp = firstPaidAt.get(id);
      return fp ? fp >= fromDate : false;
    }).length;

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
