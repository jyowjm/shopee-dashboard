import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import type { CustomerData } from '@/types/shopee';

const PAGE_SIZE = 1000;

// TikTok customer stats are derived from the orders table filtered by platform='tiktok'.
// Since TikTok doesn't have a BIGINT buyer_user_id, we use tiktok_buyer_uid as unique identity.
// Fallback: buyer_username (less reliable but always present).

async function fetchPeriodTikTokOrders(from: string, to: string) {
  const supabase = getSupabase();
  const all: { tiktok_buyer_uid: string | null; buyer_username: string | null; total_amount: number | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('tiktok_buyer_uid, buyer_username, total_amount')
      .eq('platform', 'tiktok')
      .eq('is_paid_order', true)
      .gte('create_time', from)
      .lte('create_time', to)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function fetchPeriodTikTokStates(from: string, to: string) {
  const supabase = getSupabase();
  const all: { recipient_state: string | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('recipient_state')
      .eq('platform', 'tiktok')
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
    const to   = parseInt(searchParams.get('to')   ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const fromDate = new Date(from * 1000).toISOString();
    const toDate   = new Date(to   * 1000).toISOString();

    const [orders, stateRows, totalPaidCount] = await Promise.all([
      fetchPeriodTikTokOrders(fromDate, toDate),
      fetchPeriodTikTokStates(fromDate, toDate),
      getSupabase()
        .from('orders')
        .select('order_sn', { count: 'exact', head: true })
        .eq('platform', 'tiktok')
        .eq('is_paid_order', true)
        .gte('create_time', fromDate)
        .lte('create_time', toDate)
        .then(r => r.count ?? 0),
    ]);

    // Use tiktok_buyer_uid as primary identity; fall back to buyer_username
    const byBuyer = new Map<string, { orderCount: number; totalSpend: number; firstSeen?: string }>();
    for (const o of orders) {
      const key = o.tiktok_buyer_uid ?? o.buyer_username ?? 'unknown';
      const prev = byBuyer.get(key) ?? { orderCount: 0, totalSpend: 0 };
      byBuyer.set(key, {
        orderCount: prev.orderCount + 1,
        totalSpend: prev.totalSpend + (o.total_amount ?? 0),
      });
    }

    const total = byBuyer.size;

    // Top locations (same logic as Shopee)
    const STATE_ALIASES: Record<string, string> = {
      'kuala lumpur': 'W.P. Kuala Lumpur',
      'w.p. kuala lumpur': 'W.P. Kuala Lumpur',
      'penang': 'Pulau Pinang',
      'pulau pinang': 'Pulau Pinang',
      'labuan': 'W.P. Labuan',
    };

    const stateCount = new Map<string, { display: string; count: number }>();
    for (const o of stateRows) {
      const raw = o.recipient_state;
      if (!raw?.trim()) continue;
      const normalised = STATE_ALIASES[raw.trim().toLowerCase()] ?? raw.trim();
      const key = normalised.toLowerCase();
      const entry = stateCount.get(key) ?? { display: normalised, count: 0 };
      stateCount.set(key, { display: entry.display, count: entry.count + 1 });
    }

    const topLocations = [...stateCount.values()]
      .sort((a, b) => b.count - a.count)
      .map(({ display, count }) => ({ state: display, count }));

    if (total === 0) {
      return NextResponse.json({
        total_unique_customers:  0,
        new_customers:           0,
        existing_customers:      0,
        repeat_purchase_rate:    0,
        avg_orders_per_customer: 0,
        avg_spend_per_customer:  0,
        top_locations:           topLocations,
        capped:                  false,
        location_coverage: {
          orders_with_state:  stateRows.length,
          total_paid_orders:  totalPaidCount as number,
        },
      } satisfies CustomerData);
    }

    // "New" = uid first appeared within this period. We approximate using the DB:
    // fetch earliest create_time per tiktok_buyer_uid from all historical orders.
    const buyerUids = [...byBuyer.keys()].filter(k => k !== 'unknown');
    let newCustomers = 0;

    if (buyerUids.length > 0) {
      const { data: earliestRows } = await getSupabase()
        .from('orders')
        .select('tiktok_buyer_uid, create_time')
        .eq('platform', 'tiktok')
        .eq('is_paid_order', true)
        .in('tiktok_buyer_uid', buyerUids)
        .order('create_time', { ascending: true });

      const firstSeen = new Map<string, string>();
      for (const row of earliestRows ?? []) {
        if (row.tiktok_buyer_uid && !firstSeen.has(row.tiktok_buyer_uid)) {
          firstSeen.set(row.tiktok_buyer_uid, row.create_time);
        }
      }

      newCustomers = buyerUids.filter(uid => {
        const fp = firstSeen.get(uid);
        return fp ? fp >= fromDate : false;
      }).length;
    }

    const values = [...byBuyer.values()];
    const repeatBuyers = values.filter(v => v.orderCount >= 2).length;

    const result: CustomerData = {
      total_unique_customers:  total,
      new_customers:           newCustomers,
      existing_customers:      total - newCustomers,
      repeat_purchase_rate:    total > 0 ? (repeatBuyers / total) * 100 : 0,
      avg_orders_per_customer: total > 0 ? values.reduce((s, v) => s + v.orderCount, 0) / total : 0,
      avg_spend_per_customer:  total > 0 ? values.reduce((s, v) => s + v.totalSpend, 0) / total : 0,
      top_locations:           topLocations,
      capped:                  false,
      location_coverage: {
        orders_with_state: stateRows.length,
        total_paid_orders: totalPaidCount as number,
      },
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
