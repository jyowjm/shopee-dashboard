import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderSummaries, fetchEscrowBatch, type EscrowOrderIncome } from '@/lib/orders';
import { subOneMonthMyt } from '@/lib/datetime';
import type { FeesData, ApiError } from '@/types/dashboard';

function aggregateFees(
  incomes: EscrowOrderIncome[],
): Pick<FeesData, 'net_payout' | 'gross_revenue' | 'total_fees' | 'fee_rate' | 'breakdown'> {
  let net_payout = 0;
  let gross_revenue = 0;
  let commission_fee = 0;
  let service_fee = 0;
  let transaction_fee = 0;

  for (const inc of incomes) {
    net_payout += inc.escrow_amount ?? 0;
    gross_revenue += inc.buyer_total_amount ?? 0;
    commission_fee += inc.commission_fee ?? 0;
    service_fee += inc.service_fee ?? 0;
    transaction_fee += inc.seller_transaction_fee ?? 0;
  }

  const total_fees = commission_fee + service_fee + transaction_fee;
  const fee_rate = gross_revenue > 0 ? (total_fees / gross_revenue) * 100 : 0;

  return {
    net_payout,
    gross_revenue,
    total_fees,
    fee_rate,
    breakdown: {
      commission_fee,
      service_fee,
      transaction_fee,
      affiliate_fee: 0,
      tax_amount: 0,
      shipping_fee: 0,
      adjustment: 0,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to = parseInt(searchParams.get('to') ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    // Previous period: month-aware for this_month/last_month, duration-shift for everything else
    const preset = searchParams.get('preset');
    let prevFrom: number;
    let prevTo: number;
    if (preset === 'this_month' || preset === 'last_month') {
      prevFrom = subOneMonthMyt(from);
      prevTo = subOneMonthMyt(to);
    } else {
      const duration = to - from;
      prevFrom = from - duration;
      prevTo = from;
    }

    // Fetch current and previous period order summaries in parallel
    const [{ orders, capped }, { orders: prevOrders }] = await Promise.all([
      fetchOrderSummaries(from, to),
      fetchOrderSummaries(prevFrom, prevTo),
    ]);

    const activeSns = orders
      .filter((o) => !['CANCELLED', 'IN_CANCEL'].includes(o.order_status))
      .map((o) => o.order_sn);
    const activePrevSns = prevOrders
      .filter((o) => !['CANCELLED', 'IN_CANCEL'].includes(o.order_status))
      .map((o) => o.order_sn);

    // Fetch escrow details for both periods in parallel
    const [currentBatch, prevBatch] = await Promise.all([
      fetchEscrowBatch(activeSns),
      fetchEscrowBatch(activePrevSns),
    ]);

    const current = aggregateFees(currentBatch.map((b) => b.order_income));
    const prev = aggregateFees(prevBatch.map((b) => b.order_income));

    const result: FeesData = {
      ...current,
      capped,
      prev_net_payout: prev.net_payout,
      prev_total_fees: prev.total_fees,
    };

    return NextResponse.json(result);
  } catch (err) {
    const e = err as ApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
