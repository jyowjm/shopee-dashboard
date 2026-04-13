'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subMonths } from 'date-fns';
import type { DateRange } from './TimeFilter';
import type { RevenueData } from '@/types/shopee';

// Returns a human-readable label for the comparison period, e.g. "Apr 6", "Mar 1–8", "Mar 26 – Apr 1"
function getPrevPeriodLabel(dateRange: DateRange): string {
  const { from, to, preset } = dateRange;
  const currentYear = new Date().getFullYear();

  let prevFrom: Date;
  let prevTo: Date;

  if (preset === 'this_month' || preset === 'last_month') {
    prevFrom = subMonths(from, 1);
    prevTo = subMonths(to, 1);
  } else {
    const duration = to.getTime() - from.getTime();
    prevFrom = new Date(from.getTime() - duration);
    prevTo = new Date(from.getTime() - 1); // -1ms so it shows the last day of prev period
  }

  const yearSuffix = (d: Date) => d.getFullYear() !== currentYear ? `, ${d.getFullYear()}` : '';
  const fmtDay = (d: Date) => format(d, 'MMM d') + yearSuffix(d);

  const fromLabel = fmtDay(prevFrom);
  const toLabel = fmtDay(new Date(prevTo.getTime() - 1)); // -1ms for display end

  if (fromLabel === toLabel) return fromLabel;

  // Same month and year — compact: "Mar 1–8"
  if (
    format(prevFrom, 'MMM yyyy') === format(new Date(prevTo.getTime() - 1), 'MMM yyyy')
  ) {
    return `${format(prevFrom, 'MMM d')}–${format(new Date(prevTo.getTime() - 1), 'd')}${yearSuffix(prevFrom)}`;
  }

  return `${fromLabel} – ${toLabel}`;
}

function DeltaBadge({ current, previous, periodLabel }: { current: number; previous: number; periodLabel: string }) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
      </span>
      <span className="text-xs text-gray-400">vs {periodLabel}</span>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'text-green-600',
  SHIPPED: 'text-blue-600',
  READY_TO_SHIP: 'text-purple-600',
  PAID: 'text-orange-500',
  CANCELLED: 'text-red-500',
  IN_CANCEL: 'text-amber-500',
  TO_RETURN: 'text-pink-500',
  UNPAID: 'text-gray-400',
};

interface Props {
  dateRange: DateRange;
  refreshKey: number;
  platform: 'all' | 'shopee' | 'tiktok';
  hasShopee: boolean;
  hasTikTok: boolean;
}

function mergeRevenue(a: RevenueData, b: RevenueData): RevenueData {
  const dailyMap = new Map<string, number>();
  for (const d of [...a.daily, ...b.daily]) {
    dailyMap.set(d.date, (dailyMap.get(d.date) ?? 0) + d.revenue);
  }
  const daily = Array.from(dailyMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((x, y) => x.date.localeCompare(y.date));

  // Shipping fields (TikTok-only) are not forwarded — the shipping toggle only shows
  // when platform === 'tiktok', so the merged 'all platforms' view never needs them.
  return {
    total_revenue:       a.total_revenue + b.total_revenue,
    order_count:         a.order_count   + b.order_count,
    daily,
    orders:              [...a.orders, ...b.orders].sort((x, y) => y.date.localeCompare(x.date)),
    capped:              a.capped || b.capped,
    prev_total_revenue:  a.prev_total_revenue + b.prev_total_revenue,
    prev_order_count:    a.prev_order_count   + b.prev_order_count,
  };
}

export default function RevenueSection({ dateRange, refreshKey, platform, hasShopee, hasTikTok }: Props) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [includeShipping, setIncludeShipping] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('tiktok-revenue-include-shipping') === 'true';
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const from = Math.floor(dateRange.from.getTime() / 1000);
      const to = Math.floor(dateRange.to.getTime() / 1000);
      const presetParam = dateRange.preset ? `&preset=${dateRange.preset}` : '';
      const qs = `from=${from}&to=${to}${presetParam}`;

      if (platform === 'all' && hasShopee && hasTikTok) {
        const [shopeeRes, tiktokRes] = await Promise.all([
          fetch(`/api/shopee/revenue?${qs}`),
          fetch(`/api/tiktok/revenue?${qs}`),
        ]);
        if (shopeeRes.status === 401 || tiktokRes.status === 401) { throw new Error('Session expired — please reconnect your shop.'); }
        const [shopeeData, tiktokData]: [RevenueData, RevenueData] = await Promise.all([
          shopeeRes.json(),
          tiktokRes.json(),
        ]);
        setData(mergeRevenue(shopeeData, tiktokData));
      } else {
        const url = platform === 'tiktok' ? `/api/tiktok/revenue?${qs}` : `/api/shopee/revenue?${qs}`;
        const res = await fetch(url);
        if (res.status === 401) { throw new Error('Session expired — please reconnect your shop.'); }
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
        setData(await res.json());
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [dateRange, refreshKey]);

  // Shipping fields are only present on TikTok responses
  const shippingRevenue     = data?.total_shipping_revenue     ?? 0;
  const prevShippingRevenue = data?.prev_total_shipping_revenue ?? 0;
  const showShipping        = platform === 'tiktok' && includeShipping;
  const displayRevenue      = (data?.total_revenue     ?? 0) + (showShipping ? shippingRevenue     : 0);
  const prevDisplayRevenue  = (data?.prev_total_revenue ?? 0) + (showShipping ? prevShippingRevenue : 0);

  const revenueLabel   = platform === 'tiktok' ? (includeShipping ? 'Gross revenue'   : 'Product revenue')   : 'Total revenue';
  const revenueCaption = platform === 'tiktok'
    ? (includeShipping
        ? 'MSRP − seller discounts + buyer shipping · excl. platform discounts'
        : 'MSRP − seller discounts · excl. platform discounts & shipping')
    : null;
  const tooltipLayman  = includeShipping
    ? 'Everything customers paid us — products and shipping — before TikTok subsidised anything.'
    : 'What customers paid us for the products, before TikTok subsidised anything.';
  const tooltipFormula = includeShipping
    ? 'Formula: MSRP − seller discounts + buyer shipping fee. Platform discounts excluded.'
    : 'Formula: MSRP − seller discounts. Platform discounts excluded.';

  if (loading) return <SectionSkeleton title="Revenue" />;
  if (error) return <SectionError title="Revenue" message={error} onRetry={load} />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Revenue</h2>
        {platform === 'tiktok' && (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold ${!includeShipping ? 'text-orange-600' : 'text-gray-400'}`}>
              Product
            </span>
            <button
              onClick={() => {
                const next = !includeShipping;
                setIncludeShipping(next);
                localStorage.setItem('tiktok-revenue-include-shipping', String(next));
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                includeShipping ? 'bg-orange-500' : 'bg-gray-200'
              }`}
              aria-label="Include buyer shipping in revenue"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  includeShipping ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className={`text-xs font-semibold ${includeShipping ? 'text-orange-600' : 'text-gray-400'}`}>
              + Ship
            </span>
          </div>
        )}
      </div>
      {data?.capped && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mb-4">
          Showing data for first 500 orders — narrow your date range for full accuracy.
        </p>
      )}
      <div className="flex gap-8 mb-6">
        {(() => { const periodLabel = getPrevPeriodLabel(dateRange); return (<>
        <div>
          <div className="flex items-start gap-2">
            <p className="text-3xl font-bold text-gray-900">RM {displayRevenue.toFixed(2)}</p>
            {data && <DeltaBadge current={displayRevenue} previous={prevDisplayRevenue} periodLabel={periodLabel} />}
          </div>
          <div className="flex items-center gap-1 mt-1">
            <p className="text-sm text-gray-500">{revenueLabel}</p>
            {platform === 'tiktok' && (
              <div className="relative group">
                <span className="text-xs text-gray-300 cursor-default border-b border-dotted border-gray-300 leading-none">ℹ</span>
                <div className="absolute left-5 top-0 z-10 hidden group-hover:block w-60 bg-gray-900 text-white rounded-lg p-3 text-xs shadow-xl">
                  <p className="font-semibold mb-1.5">💡 What is {revenueLabel}?</p>
                  <p className="text-gray-300 mb-2 leading-relaxed">{tooltipLayman}</p>
                  <p className="text-gray-500 border-t border-gray-700 pt-2 leading-relaxed">{tooltipFormula}</p>
                </div>
              </div>
            )}
          </div>
          {revenueCaption && (
            <p className="text-xs text-gray-300 italic mt-0.5">{revenueCaption}</p>
          )}
        </div>
        <div>
          <div className="flex items-start gap-2">
            <p className="text-3xl font-bold text-gray-900">{data?.order_count}</p>
            {data && <DeltaBadge current={data.order_count} previous={data.prev_order_count} periodLabel={periodLabel} />}
          </div>
          <p className="text-sm text-gray-500 mt-1">Paid orders</p>
        </div>
        </>); })()}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data?.daily ?? []}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={d => format(new Date(d), 'MMM d')} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `RM ${v}`} />
          <Tooltip formatter={(v: unknown) => [`RM ${(v as number).toFixed(2)}`, 'Revenue']} labelFormatter={l => format(new Date(l as string), 'MMM d, yyyy')} />
          <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>

      {/* Per-order breakdown — load on demand */}
      {(data?.orders?.length ?? 0) > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <button
            onClick={() => setShowOrders(v => !v)}
            className="text-xs font-medium text-orange-600 uppercase tracking-wide hover:text-orange-700"
          >
            {showOrders ? 'Hide breakdown ▲' : 'Show breakdown ▼'}
          </button>
          {showOrders && (
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Order</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data!.orders.map(o => (
                  <tr key={o.order_sn} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 text-gray-500 font-mono text-xs">{o.order_sn}</td>
                    <td className="py-2 text-gray-600">{o.date}</td>
                    <td className={`py-2 text-xs font-medium ${STATUS_COLORS[o.status] ?? 'text-gray-500'}`}>
                      {o.status?.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 text-right font-medium">RM {o.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={3} className="pt-2 text-sm font-semibold text-gray-700">Total</td>
                  <td className="pt-2 text-right font-bold text-gray-900">RM {data!.total_revenue.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-20 mb-4" />
      <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );
}

function SectionError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">{title}</h2>
      <p className="text-sm text-red-600 mb-3">{message}</p>
      <button onClick={onRetry} className="text-sm text-orange-600 underline">Retry</button>
    </div>
  );
}
