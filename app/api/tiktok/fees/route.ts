import { NextRequest, NextResponse } from 'next/server';
import { subMonths } from 'date-fns';
import { fetchTikTokOrderList } from '@/lib/tiktok-orders';
import { callTikTok } from '@/lib/tiktok';
import type { TikTokApiError, TikTokOrderStatement } from '@/types/tiktok';
import type { FeesData } from '@/types/shopee';

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

// Only settled (COMPLETED) orders have statement_transaction records
const SETTLED_STATUSES = new Set(['COMPLETED', 'DELIVERED']);

// Max orders to fetch statement data for — avoids excessive API calls
const STATEMENT_CAP = 50;

function subOneMonthMyt(unixSeconds: number): number {
  const mytDate = new Date(unixSeconds * 1000 + MYT_OFFSET_MS);
  const shifted = subMonths(mytDate, 1);
  return Math.floor((shifted.getTime() - MYT_OFFSET_MS) / 1000);
}

function parseAmt(val: string | undefined | null): number {
  if (!val) return 0;
  return parseFloat(val) || 0;
}

/**
 * Fetch the statement transactions for a single settled order.
 * Uses GET /finance/202501/orders/{order_id}/statement_transactions
 * Available for all regions (including SEA Malaysia).
 * Returns null if the order is not yet settled.
 */
async function fetchOrderStatement(orderId: string): Promise<TikTokOrderStatement | null> {
  try {
    const data = await callTikTok<TikTokOrderStatement>(
      `/finance/202501/orders/${orderId}/statement_transactions`,
      {}
    );
    return data;
  } catch {
    // Order not settled yet — return null (treat as no fees data)
    return null;
  }
}

/**
 * Fetch statement data for a batch of order IDs in parallel.
 * Returns only the records that have been settled.
 */
async function fetchStatements(orderIds: string[]): Promise<TikTokOrderStatement[]> {
  const results = await Promise.all(orderIds.map(id => fetchOrderStatement(id)));
  return results.filter((r): r is TikTokOrderStatement => r !== null);
}

function aggregateFees(statements: TikTokOrderStatement[]) {
  let net_payout      = 0;
  let gross_revenue   = 0;
  let total_fees      = 0;

  for (const s of statements) {
    gross_revenue += parseAmt(s.revenue_amount);
    // fee_and_tax_amount is negative — take absolute value for "fees charged"
    total_fees    += Math.abs(parseAmt(s.fee_and_tax_amount));
    net_payout    += parseAmt(s.settlement_amount);
  }

  const fee_rate = gross_revenue > 0 ? (total_fees / gross_revenue) * 100 : 0;
  return { net_payout, gross_revenue, total_fees, fee_rate };
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

    // Fetch order lists for both periods
    const [{ orders: currentList, capped }, { orders: prevList }] = await Promise.all([
      fetchTikTokOrderList(from, to, 500),
      fetchTikTokOrderList(prevFrom, prevTo, 500),
    ]);

    // Only completed/delivered orders have settled statements
    const settledIds     = currentList
      .filter(o => SETTLED_STATUSES.has(o.status))
      .slice(0, STATEMENT_CAP)
      .map(o => o.id);
    const settledPrevIds = prevList
      .filter(o => SETTLED_STATUSES.has(o.status))
      .slice(0, STATEMENT_CAP)
      .map(o => o.id);

    // Fetch statement data for both periods in parallel
    const [currentStatements, prevStatements] = await Promise.all([
      fetchStatements(settledIds),
      fetchStatements(settledPrevIds),
    ]);

    const current = aggregateFees(currentStatements);
    const prev    = aggregateFees(prevStatements);

    const result: FeesData = {
      net_payout:     current.net_payout,
      gross_revenue:  current.gross_revenue,
      total_fees:     current.total_fees,
      fee_rate:       current.fee_rate,
      breakdown: {
        commission_fee:  current.total_fees,   // fee_and_tax_amount covers commission + taxes
        service_fee:     0,
        transaction_fee: 0,
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
