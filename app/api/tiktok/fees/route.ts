import { NextRequest, NextResponse } from 'next/server';
import { subMonths } from 'date-fns';
import { callTikTok } from '@/lib/tiktok';
import type {
  TikTokApiError,
  TikTokStatement,
  TikTokStatementTransaction,
  TikTokOrderTransaction,
} from '@/types/tiktok';
import type { FeesData } from '@/types/shopee';

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

// Max settled orders to fetch fee_tax_breakdown for per period
const ORDER_CAP = 100;

function subOneMonthMyt(unixSeconds: number): number {
  const mytDate = new Date(unixSeconds * 1000 + MYT_OFFSET_MS);
  const shifted = subMonths(mytDate, 1);
  return Math.floor((shifted.getTime() - MYT_OFFSET_MS) / 1000);
}

function parseAmt(val: string | undefined | null): number {
  if (!val) return 0;
  return parseFloat(val) || 0;
}

/** Fetch all daily statement records for a date range. */
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
 * Fetch all order IDs settled under a given statement.
 * Uses GET /finance/202501/statements/{id}/statement_transactions
 */
async function fetchStatementOrderIds(statementId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = '';

  do {
    const query: Record<string, string> = {
      sort_field: 'order_create_time',
      sort_order: 'DESC',
      page_size:  '100',
      ...(pageToken ? { page_token: pageToken } : {}),
    };

    const data = await callTikTok<{
      transactions?: TikTokStatementTransaction[];
      next_page_token?: string;
    }>(
      `/finance/202501/statements/${statementId}/statement_transactions`,
      query
    );

    for (const t of data.transactions ?? []) {
      if (t.order_id) ids.push(t.order_id as string);
    }
    pageToken = data.next_page_token ?? '';
  } while (pageToken);

  return ids;
}

/**
 * Fetch SKU-level fee_tax_breakdown for a single order.
 * Uses GET /finance/202501/orders/{order_id}/statement_transactions
 * Returns null if the order has no settled record.
 */
async function fetchOrderTransaction(orderId: string): Promise<TikTokOrderTransaction | null> {
  try {
    return await callTikTok<TikTokOrderTransaction>(
      `/finance/202501/orders/${orderId}/statement_transactions`,
      {}
    );
  } catch {
    return null;
  }
}

interface AggregateResult {
  net_payout:    number;
  gross_revenue: number;
  total_fees:    number;
  fee_rate:      number;
  referral:      number;
  transaction:   number;
  affiliate:     number;
  service:       number;
  tax:           number;
  shipping_fee:  number;
}

function aggregateFees(
  orderTxns: TikTokOrderTransaction[],
  shippingFromStatements: number,
  adjustmentFromStatements: number
): AggregateResult & { adjustment: number } {
  let net_payout    = 0;
  let gross_revenue = 0;
  let referral      = 0;
  let transaction   = 0;
  let affiliate     = 0;
  let service       = 0;
  let tax           = 0;
  let shipping_fee  = 0;

  for (const order of orderTxns) {
    gross_revenue += parseAmt(order.revenue_amount);
    net_payout    += parseAmt(order.settlement_amount);
    shipping_fee  += Math.abs(parseAmt(order.shipping_cost_amount));

    for (const sku of order.sku_transactions ?? []) {
      const fee  = sku.fee_tax_breakdown?.fee;
      const taxB = sku.fee_tax_breakdown?.tax;

      if (fee) {
        referral    += Math.abs(parseAmt(fee.referral_fee_amount));
        transaction += Math.abs(parseAmt(fee.transaction_fee_amount));
        affiliate   += Math.abs(parseAmt(fee.affiliate_commission_amount_before_pit));
        service     += Math.abs(parseAmt(fee.sfp_service_fee_amount))
                     + Math.abs(parseAmt(fee.voucher_xtra_service_fee_amount))
                     + Math.abs(parseAmt(fee.flash_sales_service_fee_amount))
                     + Math.abs(parseAmt(fee.cofunded_promotion_service_fee_amount))
                     + Math.abs(parseAmt(fee.live_specials_fee_amount))
                     + Math.abs(parseAmt(fee.pre_order_service_fee_amount));
      }

      if (taxB) {
        tax += Math.abs(parseAmt(taxB.sst_amount))
             + Math.abs(parseAmt(taxB.vat_amount))
             + Math.abs(parseAmt(taxB.gst_amount));
      }
    }
  }

  // Fall back to statement-level shipping if order-level returns 0
  // (happens when no order transactions are fetched e.g. all capped out)
  if (shipping_fee === 0 && shippingFromStatements > 0) {
    shipping_fee = shippingFromStatements;
  }

  const total_fees = referral + transaction + affiliate + service + tax;
  const fee_rate   = gross_revenue > 0 ? (total_fees / gross_revenue) * 100 : 0;

  return {
    net_payout, gross_revenue, total_fees, fee_rate,
    referral, transaction, affiliate, service, tax,
    shipping_fee, adjustment: adjustmentFromStatements,
  };
}

async function fetchFeesForPeriod(from: number, to: number): Promise<{
  agg: ReturnType<typeof aggregateFees>;
  capped: boolean;
}> {
  // 1. Fetch statements for the date range
  const statements = await fetchTikTokStatements(from, to);

  // Statement-level fallback values for shipping + adjustment
  const shippingFromStatements = statements.reduce(
    (sum, s) => sum + Math.abs(parseAmt(s.shipping_cost_amount as string)), 0
  );
  const adjustmentFromStatements = statements.reduce(
    (sum, s) => sum + parseAmt(s.adjustment_amount as string), 0
  );

  // 2. Get all settled order IDs from every statement (parallel)
  const orderIdSets = await Promise.all(statements.map(s => fetchStatementOrderIds(s.id)));
  const allOrderIds = [...new Set(orderIdSets.flat())];

  // 3. Cap and fetch order transactions in parallel
  const capped    = allOrderIds.length > ORDER_CAP;
  const orderIds  = allOrderIds.slice(0, ORDER_CAP);
  const rawTxns   = await Promise.all(orderIds.map(id => fetchOrderTransaction(id)));
  const orderTxns = rawTxns.filter((t): t is TikTokOrderTransaction => t !== null);

  const agg = aggregateFees(orderTxns, shippingFromStatements, adjustmentFromStatements);
  return { agg, capped };
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

    const [{ agg: current, capped }, { agg: prev }] = await Promise.all([
      fetchFeesForPeriod(from, to),
      fetchFeesForPeriod(prevFrom, prevTo),
    ]);

    const result: FeesData = {
      net_payout:    current.net_payout,
      gross_revenue: current.gross_revenue,
      total_fees:    current.total_fees,
      fee_rate:      current.fee_rate,
      breakdown: {
        commission_fee:  current.referral,
        service_fee:     current.service,
        transaction_fee: current.transaction,
        affiliate_fee:   current.affiliate,
        tax_amount:      current.tax,
        shipping_fee:    current.shipping_fee,
        adjustment:      current.adjustment,
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
