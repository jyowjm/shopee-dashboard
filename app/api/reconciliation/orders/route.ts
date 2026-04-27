import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period_id = searchParams.get('period_id');
  const filter = searchParams.get('filter') ?? 'all';

  if (!period_id) {
    return NextResponse.json({ error: 'period_id required' }, { status: 400 });
  }

  const supabase = getSupabase();
  let query = supabase
    .from('payout_orders')
    .select('*')
    .eq('period_id', period_id)
    .order('payout_date', { ascending: true });

  if (filter === 'discrepancies') query = query.eq('has_discrepancy', true);

  const { data: orders, error: ordersErr } = await query;
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });

  const { data: notes } = await supabase
    .from('recon_notes')
    .select('order_sn, status, notes')
    .eq('period_id', period_id);

  type NoteRow = { order_sn: string; status: string; notes: string | null };
  const notesMap = new Map<string, NoteRow>((notes ?? []).map((n: NoteRow) => [n.order_sn, n]));

  const merged = (orders ?? []).map((o: Record<string, unknown>) => ({
    ...o,
    status: notesMap.get(o.order_sn as string)?.status ?? 'unreviewed',
    notes: notesMap.get(o.order_sn as string)?.notes ?? null,
  }));

  const filtered =
    filter === 'investigating' || filter === 'resolved'
      ? merged.filter((o: Record<string, unknown>) => o.status === filter)
      : merged;

  return NextResponse.json(filtered);
}
