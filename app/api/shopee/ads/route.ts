import { NextRequest, NextResponse } from 'next/server';
import { callShopee } from '@/lib/shopee';
import { parse, addDays, format, isAfter } from 'date-fns';
import { MYT_OFFSET_MS } from '@/lib/datetime';
import type { AdsData, ApiError } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

interface AdsDailyRecord {
  date: string;
  expense: number;
  broad_gmv: number;
  broad_roas: number;
  clicks: number;
  impression: number;
}

const DATE_FMT = 'dd-MM-yyyy';
const CHUNK_DAYS = 29; // API limit: max 30 days inclusive per request

function parseDate(s: string): Date {
  return parse(s, DATE_FMT, new Date());
}

function fmtDate(d: Date): string {
  return format(d, DATE_FMT);
}

// Convert Unix seconds → MYT calendar date (a Date pinned to UTC midnight of the
// MYT-local day) so chunk boundaries line up with Malaysian seller days.
function unixToMytDay(unixSeconds: number): Date {
  const mytMidnight = new Date(unixSeconds * 1000 + MYT_OFFSET_MS);
  mytMidnight.setUTCHours(0, 0, 0, 0);
  return mytMidnight;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const from = parseInt(searchParams.get('from') ?? '0', 10);
    const to = parseInt(searchParams.get('to') ?? '0', 10);

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 });
    }

    const fromDate = unixToMytDay(from);
    const toDate = unixToMytDay(to);

    // Build ≤30-day chunks
    const chunks: Array<{ apiStart: string; apiEnd: string }> = [];
    let cursor = fromDate;
    while (!isAfter(cursor, toDate)) {
      const chunkEnd = new Date(Math.min(addDays(cursor, CHUNK_DAYS).getTime(), toDate.getTime()));
      const apiStart = fmtDate(cursor);
      let apiEnd = fmtDate(chunkEnd);
      // API rejects start == end; bump end by 1 day for single-day ranges
      if (apiStart === apiEnd) {
        apiEnd = fmtDate(addDays(chunkEnd, 1));
      }
      chunks.push({ apiStart, apiEnd });
      cursor = addDays(cursor, CHUNK_DAYS + 1);
    }

    const allRecords: AdsDailyRecord[] = [];

    for (const chunk of chunks) {
      try {
        const records = await callShopee<AdsDailyRecord[]>(
          '/api/v2/ads/get_all_cpc_ads_daily_performance',
          { start_date: chunk.apiStart, end_date: chunk.apiEnd },
        );

        if (Array.isArray(records)) {
          for (const r of records) {
            const d = parseDate(r.date);
            if (!isAfter(fromDate, d) && !isAfter(d, toDate)) {
              allRecords.push(r);
            }
          }
        }
      } catch {
        // Skip chunks that fail (e.g. future date when "Today" is selected,
        // or permissions not enabled) — remaining chunks still aggregate
        continue;
      }
    }

    const total_spend = allRecords.reduce((s, r) => s + (r.expense ?? 0), 0);
    const ad_revenue = allRecords.reduce((s, r) => s + (r.broad_gmv ?? 0), 0);
    const clicks = allRecords.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const impressions = allRecords.reduce((s, r) => s + (r.impression ?? 0), 0);
    const roas = total_spend > 0 ? ad_revenue / total_spend : 0;

    return NextResponse.json({ total_spend, ad_revenue, roas, clicks, impressions } as AdsData);
  } catch (err) {
    const e = err as ApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
