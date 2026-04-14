import { NextRequest, NextResponse } from 'next/server';
import { subMonths } from 'date-fns';
import { callTikTok } from '@/lib/tiktok';
import type { TikTokApiError, TikTokStatement } from '@/types/tiktok';
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

/**
 * Fetch all daily statement records for a date range.
 * Uses GET /finance/202309/statements — only settled orders appear here.
 *
 * Date params: statement_time_ge / statement_time_lt (Unix seconds).
 * sort_field "statement_time" is required by the API.
 */
async function fetchTikTokStatements(from: number, to: number): Promise<TikTokStatement[]> {
  const all: TikTokStatement[] = [];
  let pageToken = '';

  do {
    const query: Record<string, string> = {
      statement_time_ge: String(from),
      statement_time_lt: String(to),
      sort_field:        'statement_time',
      sort_order:        'DESC',
      page_size:         '100',
      ...(pageToken ? { page_token: pageToken } : {}),
    };

    const data = await callTikTok<{ statements?: TikTokStatement[]; next_page_token?: string }>(
      '/finance/202309/statements',
      query
    );

    all.push(...(data.statements ?? []));
    pageToken = data.next_page_token ?? '';
  } while (pageToken);

  return all;
}

/**
 * Aggregate fee totals directly from statement-level records.
 * Each statement already contains revenue_amount, fee_amount, settlement_amount.
 */
function aggregateFees(statements: TikTokStatement[]) {
  let net_payout    = 0;
  let gross_revenue = 0;
  let total_fees    = 0;

  for (const s of statements) {
    gross_revenue += parseAmt(s.revenue_amount);
    total_fees    += Math.abs(parseAmt(s.fee_amount));
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

    // Fetch statements for both periods in parallel.
    // Statements only contain settled orders — no status-filtering needed.
    const [currentStatements, prevStatements] = await Promise.all([
      fetchTikTokStatements(from, to),
      fetchTikTokStatements(prevFrom, prevTo),
    ]);

    const current = aggregateFees(currentStatements);
    const prev    = aggregateFees(prevStatements);

    const result: FeesData = {
      net_payout:     current.net_payout,
      gross_revenue:  current.gross_revenue,
      total_fees:     current.total_fees,
      fee_rate:       current.fee_rate,
      breakdown: {
        commission_fee:  current.total_fees,  // fee_amount covers all platform fees
        service_fee:     0,
        transaction_fee: 0,
      },
      capped:          false,
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
