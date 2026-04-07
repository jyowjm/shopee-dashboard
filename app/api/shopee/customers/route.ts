import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import type { CustomerData, ShopeeApiError } from '@/types/shopee';

const PAGE_SIZE = 1000;

// Fetch paid orders with a known buyer_user_id — used for customer stats
async function fetchPeriodOrders(from: string, to: string) {
  const supabase = getSupabase();
  const all: { buyer_user_id: number; total_amount: number | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('buyer_user_id, total_amount')
      .eq('is_paid_order', true)
      .gte('create_time', from)
      .lte('create_time', to)
      .not('buyer_user_id', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

// Fetch state data for all paid orders — includes report-only orders (null buyer_user_id)
async function fetchPeriodStates(from: string, to: string) {
  const supabase = getSupabase();
  const all: { recipient_state: string | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('recipient_state')
      .eq('is_paid_order', true)
      .gte('create_time', from)
      .lte('create_time', to)
      .not('recipient_state', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
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

    // Run both queries in parallel
    const [orders, stateRows] = await Promise.all([
      fetchPeriodOrders(fromDate, toDate),
      fetchPeriodStates(fromDate, toDate),
    ]);

    // Aggregate per-buyer stats for the period
    const byBuyer = new Map<number, { orderCount: number; totalSpend: number }>();
    for (const o of orders) {
      const prev = byBuyer.get(o.buyer_user_id) ?? { orderCount: 0, totalSpend: 0 };
      byBuyer.set(o.buyer_user_id, {
        orderCount: prev.orderCount + 1,
        totalSpend: prev.totalSpend + (o.total_amount ?? 0),
      });
    }

    const total = byBuyer.size;

    // Top locations — from all paid orders including report-only (no buyer_user_id filter)
    const stateCount = new Map<string, { display: string; count: number }>();
    for (const o of stateRows) {
      const raw = o.recipient_state;
      if (!raw?.trim()) continue;
      if (/^\*+$/.test(raw.trim())) continue; // skip masked values
      const key = raw.trim().toLowerCase();
      const entry = stateCount.get(key) ?? { display: raw.trim(), count: 0 };
      stateCount.set(key, { display: entry.display, count: entry.count + 1 });
    }
    const topLocations = [...stateCount.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ display, count }) => ({ state: display, count }));

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
      } satisfies CustomerData);
    }

    // Look up first_paid_at for all buyers seen in this period
    const buyerIds = [...byBuyer.keys()];
    const { data: buyerRows, error: bErr } = await getSupabase()
      .from('buyers')
      .select('buyer_user_id, first_paid_at')
      .in('buyer_user_id', buyerIds);
    if (bErr) throw new Error(bErr.message);

    const firstPaidAt = new Map<number, string>();
    for (const b of buyerRows ?? []) {
      if (b.first_paid_at) firstPaidAt.set(b.buyer_user_id, b.first_paid_at);
    }

    const newCustomers = buyerIds.filter(id => {
      const fp = firstPaidAt.get(id);
      return fp ? fp >= fromDate : false;
    }).length;

    const values = [...byBuyer.values()];
    const repeatBuyers = values.filter(v => v.orderCount >= 2).length;

    const result: CustomerData = {
      total_unique_customers: total,
      new_customers: newCustomers,
      existing_customers: total - newCustomers,
      repeat_purchase_rate: total > 0 ? (repeatBuyers / total) * 100 : 0,
      avg_orders_per_customer: total > 0 ? values.reduce((s, v) => s + v.orderCount, 0) / total : 0,
      avg_spend_per_customer: total > 0 ? values.reduce((s, v) => s + v.totalSpend, 0) / total : 0,
      top_locations: topLocations,
      capped: false,
    };

    return NextResponse.json(result);
  } catch (err) {
    const e = err as ShopeeApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
