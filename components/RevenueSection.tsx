'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import type { DateRange } from './TimeFilter';
import type { RevenueData } from '@/types/shopee';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
}

export default function RevenueSection({ dateRange, refreshKey }: Props) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <p className="text-3xl font-bold text-gray-900">RM {data?.total_revenue.toFixed(2)}</p>
          <p className="text-sm text-gray-500 mt-1">Total revenue</p>
        </div>
        <div>
          <p className="text-3xl font-bold text-gray-900">{data?.order_count}</p>
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
