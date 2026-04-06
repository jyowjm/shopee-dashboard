'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { DateRange } from './TimeFilter';
import type { CustomerData } from '@/types/shopee';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
}

export default function CustomersSection({ dateRange, refreshKey }: Props) {
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const from = Math.floor(dateRange.from.getTime() / 1000);
      const to = Math.floor(dateRange.to.getTime() / 1000);
      const res = await fetch(`/api/shopee/customers?from=${from}&to=${to}`);
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

  if (loading) return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded" />)}
      </div>
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );

  if (error) return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Customers</h2>
      <p className="text-sm text-red-600 mb-3">{error}</p>
      <button onClick={load} className="text-sm text-orange-600 underline">Retry</button>
    </div>
  );

  const chartHeight = Math.max(200, (data?.top_locations.length ?? 0) * 36);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Customers</h2>

      {data?.capped && (
        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          Order cap reached — figures are based on the first 500 orders in this period.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Total Customers</p>
          <p className="text-2xl font-bold text-gray-900">{data?.total_unique_customers ?? 0}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">New Customers</p>
          <p className="text-2xl font-bold text-green-600">{data?.new_customers ?? 0}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Existing Customers</p>
          <p className="text-2xl font-bold text-blue-600">{data?.existing_customers ?? 0}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Repeat Purchase Rate</p>
          <p className="text-2xl font-bold text-gray-900">{(data?.repeat_purchase_rate ?? 0).toFixed(1)}%</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Avg Orders / Customer</p>
          <p className="text-2xl font-bold text-gray-900">{(data?.avg_orders_per_customer ?? 0).toFixed(1)}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Avg Spend / Customer</p>
          <p className="text-2xl font-bold text-gray-900">RM {(data?.avg_spend_per_customer ?? 0).toFixed(2)}</p>
        </div>
      </div>

      {data && data.top_locations.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Orders by State</p>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart layout="vertical" data={data.top_locations} margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
              <YAxis type="category" dataKey="state" width={120} tick={{ fontSize: 12 }} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [v, 'Orders']} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.top_locations.map((_, i) => (
                  <Cell key={i} fill="#f97316" fillOpacity={1 - i * 0.06} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data && data.top_locations.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No location data available for this period.</p>
      )}
    </div>
  );
}
