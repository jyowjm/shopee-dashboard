import { NextRequest, NextResponse } from 'next/server';
import { subMonths } from 'date-fns';
import { fetchTikTokOrderList, fetchTikTokOrderDetails } from '@/lib/tiktok-orders';
import type { TikTokApiError } from '@/types/tiktok';
import type { RevenueData } from '@/types/shopee';

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

function subOneMonthMyt(unixSeconds: number): number {
  const mytDate = new Date(unixSeconds * 1000 + MYT_OFFSET_MS);
  const shifted = subMonths(mytDate, 1);
  return Math.floor((shifted.getTime() - MYT_OFFSET_MS) / 1000);
}

function toMytDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000 + MYT_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

const CANCELLED_STATUSES = new Set(['CANCELLED', 'PARTIALLY_REFUNDED']);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to   = parseInt(searchParams.get('to')   ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const preset = searchParams.get('preset');
    let prevFrom: number;
    let prevTo:   number;
    if (preset === 'this_month' || preset === 'last_month') {
      prevFrom = subOneMonthMyt(from);
      prevTo   = subOneMonthMyt(to);
    } else {
      const duration = to - from;
      prevFrom = from - duration;
      prevTo   = from;
    }

    const [{ orders: currentList, capped }, { orders: prevList }] = await Promise.all([
      fetchTikTokOrderList(from, to, 500),
      fetchTikTokOrderList(prevFrom, prevTo, 500),
    ]);

    const activeIds     = currentList.filter(o => !CANCELLED_STATUSES.has(o.status)).map(o => o.id);
    const activePrevIds = prevList.filter(o => !CANCELLED_STATUSES.has(o.status)).map(o => o.id);

    const [details, prevDetails] = await Promise.all([
      fetchTikTokOrderDetails(activeIds),
      fetchTikTokOrderDetails(activePrevIds),
    ]);

    // Build daily revenue map
    const dailyMap = new Map<string, number>();
    let totalRevenue = 0;
    const orderRows: RevenueData['orders'] = [];

    for (const o of details) {
      const amount = parseFloat(o.payment?.total_amount ?? '0') || 0;
      const date   = toMytDate(o.create_time);
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + amount);
      totalRevenue += amount;
      orderRows.push({ order_sn: o.id, date, status: o.status, amount });
    }

    const daily = Array.from(dailyMap.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    orderRows.sort((a, b) => b.date.localeCompare(a.date));

    const prevTotalRevenue = prevDetails.reduce(
      (sum, o) => sum + (parseFloat(o.payment?.total_amount ?? '0') || 0), 0
    );

    const result: RevenueData = {
      total_revenue:    totalRevenue,
      order_count:      details.length,
      daily,
      orders:           orderRows,
      capped,
      prev_total_revenue: prevTotalRevenue,
      prev_order_count:   prevDetails.length,
    };

    return NextResponse.json(result);
  } catch (err) {
    const e = err as TikTokApiError;
    if (e.type === 'auth')       return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
