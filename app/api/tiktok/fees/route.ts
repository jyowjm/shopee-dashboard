import { NextRequest, NextResponse } from 'next/server';
import { subMonths } from 'date-fns';
import { fetchTikTokOrderList } from '@/lib/tiktok-orders';
import { callTikTok } from '@/lib/tiktok';
import type { TikTokApiError, TikTokSettlementRecord } from '@/types/tiktok';
import type { FeesData } from '@/types/shopee';

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

function subOneMonthMyt(unixSeconds: number): number {
  const mytDate = new Date(unixSeconds * 1000 + MYT_OFFSET_MS);
  const shifted = subMonths(mytDate, 1);
  return Math.floor((shifted.getTime() - MYT_OFFSET_MS) / 1000);
}

function parseAmt(val: string | undefined | null): number {
  if (!val) return 0;
  return parseFloat(val) || 0;
}

async function fetchSettlements(from: number, to: number): Promise<TikTokSettlementRecord[]> {
  const all: TikTokSettlementRecord[] = [];
  let cursor = '';
  let hasMore = true;

  while (hasMore) {
    const body: Record<string, unknown> = {
      create_time_from: from,
      create_time_to:   to,
      page_size:        100,
      ...(cursor ? { cursor } : {}),
    };
    const data = await callTikTok<{
      records: TikTokSettlementRecord[];
      next_cursor?: string;
    }>(
      '/finance/202309/payments/search',
      {},
      { method: 'POST', body }
    );
    all.push(...(data.records ?? []));
    cursor  = data.next_cursor ?? '';
    hasMore = !!cursor;
  }

  return all;
}

function aggregateFees(settlements: TikTokSettlementRecord[]) {
  let net_payout      = 0;
  let gross_revenue   = 0;
  let commission_fee  = 0;
  let transaction_fee = 0;

  for (const s of settlements) {
    net_payout      += parseAmt(s.settlement_amount);
    gross_revenue   += parseAmt(s.subtotal);
    commission_fee  += parseAmt(s.commission_fee);
    commission_fee  += parseAmt(s.affiliate_commission);
    transaction_fee += parseAmt(s.transaction_fee);
  }

  const total_fees = commission_fee + transaction_fee;
  const fee_rate   = gross_revenue > 0 ? (total_fees / gross_revenue) * 100 : 0;

  return { net_payout, gross_revenue, total_fees, fee_rate, commission_fee, transaction_fee };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from   = parseInt(searchParams.get('from') ?? '0', 10);
    const to     = parseInt(searchParams.get('to')   ?? '0', 10);
    const preset = searchParams.get('preset');

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

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

    // Fetch settlement records for both periods in parallel
    const [currentSettlements, prevSettlements] = await Promise.all([
      fetchSettlements(from, to).catch(() => [] as TikTokSettlementRecord[]),
      fetchSettlements(prevFrom, prevTo).catch(() => [] as TikTokSettlementRecord[]),
    ]);

    const current = aggregateFees(currentSettlements);
    const prev    = aggregateFees(prevSettlements);

    // Check if order cap was hit (best-effort using order list)
    const { capped } = await fetchTikTokOrderList(from, to, 500);

    const result: FeesData = {
      net_payout:     current.net_payout,
      gross_revenue:  current.gross_revenue,
      total_fees:     current.total_fees,
      fee_rate:       current.fee_rate,
      breakdown: {
        commission_fee:  current.commission_fee,
        service_fee:     0,
        transaction_fee: current.transaction_fee,
      },
      capped,
      prev_net_payout: prev.net_payout,
      prev_total_fees: prev.total_fees,
    };

    return NextResponse.json(result);
  } catch (err) {
    const e = err as TikTokApiError;
    if (e.type === 'auth')       return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
