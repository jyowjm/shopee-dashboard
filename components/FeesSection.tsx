'use client';

import { useEffect, useState } from 'react';
import { format, subMonths } from 'date-fns';
import type { DateRange } from './TimeFilter';
import type { FeesData } from '@/types/shopee';

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
    prevTo = new Date(from.getTime() - 1);
  }

  const yearSuffix = (d: Date) => d.getFullYear() !== currentYear ? `, ${d.getFullYear()}` : '';
  const prevToDisplay = new Date(prevTo.getTime() - 1);
  const fromLabel = format(prevFrom, 'MMM d') + yearSuffix(prevFrom);
  const toLabel = format(prevToDisplay, 'MMM d') + yearSuffix(prevToDisplay);

  if (fromLabel === toLabel) return fromLabel;
  if (format(prevFrom, 'MMM yyyy') === format(prevToDisplay, 'MMM yyyy')) {
    return `${format(prevFrom, 'MMM d')}–${format(prevToDisplay, 'd')}${yearSuffix(prevFrom)}`;
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

interface Props {
  dateRange: DateRange;
  refreshKey: number;
  platform: 'all' | 'shopee' | 'tiktok';
  hasShopee: boolean;
  hasTikTok: boolean;
}

function mergeFees(a: FeesData, b: FeesData): FeesData {
  const net_payout    = a.net_payout    + b.net_payout;
  const gross_revenue = a.gross_revenue + b.gross_revenue;
  const total_fees    = a.total_fees    + b.total_fees;
  return {
    net_payout,
    gross_revenue,
    total_fees,
    fee_rate: gross_revenue > 0 ? (total_fees / gross_revenue) * 100 : 0,
    breakdown: {
      commission_fee:  a.breakdown.commission_fee  + b.breakdown.commission_fee,
      service_fee:     a.breakdown.service_fee     + b.breakdown.service_fee,
      transaction_fee: a.breakdown.transaction_fee + b.breakdown.transaction_fee,
    },
    capped:          a.capped || b.capped,
    prev_net_payout: a.prev_net_payout + b.prev_net_payout,
    prev_total_fees: a.prev_total_fees + b.prev_total_fees,
  };
}

export default function FeesSection({ dateRange, refreshKey, platform, hasShopee, hasTikTok }: Props) {
  const [data, setData] = useState<FeesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

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
          fetch(`/api/shopee/fees?${qs}`),
          fetch(`/api/tiktok/fees?${qs}`),
        ]);
        if (shopeeRes.status === 401 || tiktokRes.status === 401) { window.location.href = '/connect'; return; }
        const [shopeeData, tiktokData]: [FeesData, FeesData] = await Promise.all([
          shopeeRes.json(),
          tiktokRes.json(),
        ]);
        setData(mergeFees(shopeeData, tiktokData));
      } else {
        const url = platform === 'tiktok' ? `/api/tiktok/fees?${qs}` : `/api/shopee/fees?${qs}`;
        const res = await fetch(url);
        if (res.status === 401) { window.location.href = '/connect'; return; }
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

  if (loading) return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-16 mb-4" />
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded" />)}
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Fees</h2>
      <p className="text-sm text-red-600 mb-3">{error}</p>
      <button onClick={load} className="text-sm text-orange-600 underline">Retry</button>
    </div>
  );

  const periodLabel = getPrevPeriodLabel(dateRange);
  const rm = (n: number) => `RM ${n.toFixed(2)}`;

  const breakdownRows = data ? [
    { label: 'Commission Fee',                         value: data.breakdown.commission_fee },
    ...(data.breakdown.service_fee > 0
      ? [{ label: 'Service Fee', value: data.breakdown.service_fee }]
      : []),
    { label: 'Transaction / Platform Fee',             value: data.breakdown.transaction_fee },
  ] : [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Fees</h2>

      {data?.capped && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mb-4">
          Showing data for first 500 orders — narrow your date range for full accuracy.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Net Payout</p>
          <div className="flex items-start gap-2">
            <p className="text-2xl font-bold text-gray-900">{rm(data?.net_payout ?? 0)}</p>
            {data && <DeltaBadge current={data.net_payout} previous={data.prev_net_payout} periodLabel={periodLabel} />}
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Total Fees</p>
          <div className="flex items-start gap-2">
            <p className="text-2xl font-bold text-gray-900">{rm(data?.total_fees ?? 0)}</p>
            {data && <DeltaBadge current={data.total_fees} previous={data.prev_total_fees} periodLabel={periodLabel} />}
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Fee Rate</p>
          <p className="text-2xl font-bold text-gray-900">{(data?.fee_rate ?? 0).toFixed(1)}%</p>
          <p className="text-xs text-gray-400 mt-0.5">of gross {rm(data?.gross_revenue ?? 0)}</p>
        </div>
      </div>

      <button
        onClick={() => setShowBreakdown(v => !v)}
        className="text-xs font-medium text-orange-600 uppercase tracking-wide hover:text-orange-700"
      >
        {showBreakdown ? 'Hide breakdown ▲' : 'Show breakdown ▼'}
      </button>

      {showBreakdown && (
        <table className="w-full text-sm mt-3 max-w-sm">
          <tbody>
            {breakdownRows.map(({ label, value }) => (
              <tr key={label} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 text-gray-600">{label}</td>
                <td className="py-1.5 text-right font-medium text-gray-900">{rm(value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200">
              <td className="pt-2 text-sm font-semibold text-gray-700">Total Fees</td>
              <td className="pt-2 text-right font-bold text-gray-900">{rm(data?.total_fees ?? 0)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
