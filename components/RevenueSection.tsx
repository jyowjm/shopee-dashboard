'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import type { DateRange } from './TimeFilter';
import type { RevenueData } from '@/types/shopee';

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
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
}

export default function RevenueSection({ dateRange, refreshKey }: Props) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const from = Math.floor(dateRange.from.getTime() / 1000);
      const to = Math.floor(dateRange.to.getTime() / 1000);
      const res = await fetch(`/api/shopee/revenue?from=${from}&to=${to}`);
      if (res.status === 401) { window.location.href = '/connect'; return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [dateRange, refreshKey]);

  if (loading) return <SectionSkeleton title="Revenue" />;
  if (error) return <SectionError title="Revenue" message={error} onRetry={load} />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Revenue</h2>
      {data?.capped && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mb-4">
          Showing data for first 500 orders — narrow your date range for full accuracy.
        </p>
      )}
      <div className="flex gap-8 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-bold text-gray-900">RM {data?.total_revenue.toFixed(2)}</p>
            {data && <DeltaBadge current={data.total_revenue} previous={data.prev_total_revenue} />}
          </div>
          <p className="text-sm text-gray-500 mt-1">Total revenue</p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-bold text-gray-900">{data?.order_count}</p>
            {data && <DeltaBadge current={data.order_count} previous={data.prev_order_count} />}
          </div>
          <p className="text-sm text-gray-500 mt-1">Paid orders</p>
        </div>
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
