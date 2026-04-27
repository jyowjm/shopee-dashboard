import { NextRequest, NextResponse } from 'next/server';
import { parsePayout } from '@/lib/payout-parser';
import {
  reconcileOrders,
  summariseReconResults,
  reconResultToDbRow,
} from '@/lib/reconciliation-engine';
import { fetchAmsConversionReport } from '@/lib/ams';
import { FEE_CONFIG } from '@/lib/fee-config';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'File must be a .xlsx payout report' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { meta, orders } = parsePayout(buffer);

    if (!orders.length) {
      return NextResponse.json({ error: 'No orders found in payout report' }, { status: 400 });
    }

    // Fetch AMS conversion report to get exact order_brand_commission per order.
    // Wrapped in try-catch so upload still works without Shopee API credentials.
    let amsAmounts: Map<string, number> = new Map();
    try {
      amsAmounts = await fetchAmsConversionReport(meta.period_from, meta.period_to);
    } catch (amsErr) {
      console.warn('AMS fetch skipped — falling back to default rate:', (amsErr as Error).message);
    }

    const results = reconcileOrders(orders, FEE_CONFIG, amsAmounts);
    const { total_actual, total_expected, total_diff } = summariseReconResults(results);

    // Insert payout period
    const supabase = getSupabase();
    const { data: period, error: periodErr } = await supabase
      .from('payout_periods')
      .insert({
        period_from: meta.period_from,
        period_to: meta.period_to,
        source: 'xlsx',
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
      period_from: meta.period_from,
      period_to: meta.period_to,
      orders_count: results.length,
      discrepancies: results.filter((r) => r.has_discrepancy).length,
      total_expected,
      total_actual,
      total_diff,
    });
  } catch (err) {
    console.error('reconciliation/upload error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
