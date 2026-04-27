import { NextRequest, NextResponse } from 'next/server';
import { callShopee } from '@/lib/shopee';
import { fetchEscrowBatch } from '@/lib/orders';
import { normaliseEscrowOrder } from '@/lib/payout-parser';
import {
  reconcileOrders,
  summariseReconResults,
  reconResultToDbRow,
} from '@/lib/reconciliation-engine';
import { fetchAmsConversionReport } from '@/lib/ams';
import { FEE_CONFIG } from '@/lib/fee-config';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_CHUNK_DAYS = 13; // API max is 14 days; use 13 to be safe

/** Split a date range into ≤13-day chunks, returning [from, to] Unix timestamps */
function chunkDateRange(fromDate: string, toDate: string): [number, number][] {
  const chunks: [number, number][] = [];
  let cursor = new Date(fromDate);
  const end = new Date(toDate);
  end.setHours(23, 59, 59);

  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + MAX_CHUNK_DAYS);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push([Math.floor(cursor.getTime() / 1000), Math.floor(chunkEnd.getTime() / 1000)]);
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return chunks;
}

/** Fetch all released order SNs for a period via get_income_detail */
async function fetchOrderSns(fromTs: number, toTs: number): Promise<string[]> {
  const sns: string[] = [];
  let cursor = '';

  while (true) {
    const params: Record<string, string | number> = {
      release_time_from: fromTs,
      release_time_to: toTs,
      income_type: 1, // 1 = Released
      page_size: 100,
    };
    if (cursor) params.cursor = cursor;

    // callShopee strips the outer `response` wrapper, so this is the inner payload directly.
    const res = await callShopee<{
      income_list: { order_sn: string }[];
      next_cursor: string;
      has_next_page: boolean;
    }>('/api/v2/payment/get_income_detail', params);

    sns.push(...(res.income_list ?? []).map((o) => o.order_sn));
    if (!res.has_next_page) break;
    cursor = res.next_cursor;
  }

  return [...new Set(sns)];
}

export async function POST(req: NextRequest) {
  try {
    const { from_date, to_date } = (await req.json()) as { from_date: string; to_date: string };

    if (!from_date || !to_date) {
      return NextResponse.json(
        { error: 'from_date and to_date required (YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    const chunks = chunkDateRange(from_date, to_date);

    // Fetch order SNs across chunks in parallel
    const chunkResults = await Promise.all(chunks.map(([f, t]) => fetchOrderSns(f, t)));
    const uniqueSns = [...new Set(chunkResults.flat())];

    if (!uniqueSns.length) {
      return NextResponse.json(
        { error: 'No released orders found for this period' },
        { status: 404 },
      );
    }

    // Fetch escrow details (parallel-batched internally)
    const batchItems = await fetchEscrowBatch(uniqueSns);
    const escrowResults = batchItems.map((item) =>
      normaliseEscrowOrder({
        order_sn: item.order_sn,
        release_time: item.release_time,
        buyer_total_amount: item.order_income.buyer_total_amount ?? 0,
        commission_fee: item.order_income.commission_fee ?? 0,
        service_fee: item.order_income.service_fee ?? 0,
        seller_transaction_fee: item.order_income.seller_transaction_fee ?? 0,
        ams_commission_fee: item.order_income.ams_commission_fee,
        original_cost_of_goods_sold: item.order_income.buyer_total_amount ?? 0,
      }),
    );

    const amsAmounts = await fetchAmsConversionReport(from_date, to_date);

    const results = reconcileOrders(escrowResults, FEE_CONFIG, amsAmounts);
    const { total_actual, total_expected, total_diff } = summariseReconResults(results);

    const supabase = getSupabase();
    const { data: period, error: periodErr } = await supabase
      .from('payout_periods')
      .insert({
        period_from: from_date,
        period_to: to_date,
        source: 'api',
        total_expected,
        total_actual,
        total_diff,
      })
      .select('id')
      .single();
    if (periodErr) throw periodErr;

    const rows = results.map((r) => reconResultToDbRow(r, period.id));

    const { error: ordersErr } = await supabase.from('payout_orders').insert(rows);
    if (ordersErr) throw ordersErr;

    return NextResponse.json({
      ok: true,
      period_id: period.id,
      period_from: from_date,
      period_to: to_date,
      orders_count: results.length,
      discrepancies: results.filter((r) => r.has_discrepancy).length,
      total_expected,
      total_actual,
      total_diff,
    });
  } catch (err) {
    console.error('reconciliation/fetch error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
