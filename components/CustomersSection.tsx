'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { DateRange } from './TimeFilter';
import type { CustomerData } from '@/types/shopee';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
  platform: 'all' | 'shopee' | 'tiktok';
  hasShopee: boolean;
  hasTikTok: boolean;
}

function mergeCustomers(a: CustomerData, b: CustomerData): CustomerData {
  const total  = a.total_unique_customers + b.total_unique_customers;
  const newC   = a.new_customers           + b.new_customers;
  const allOrders = (a.avg_orders_per_customer * a.total_unique_customers)
                  + (b.avg_orders_per_customer * b.total_unique_customers);
  const allSpend  = (a.avg_spend_per_customer  * a.total_unique_customers)
                  + (b.avg_spend_per_customer  * b.total_unique_customers);

  // Merge top locations
  const locMap = new Map<string, number>();
  for (const { state, count } of [...a.top_locations, ...b.top_locations]) {
    locMap.set(state, (locMap.get(state) ?? 0) + count);
  }
  const top_locations = Array.from(locMap.entries())
    .map(([state, count]) => ({ state, count }))
    .sort((x, y) => y.count - x.count);

  return {
    total_unique_customers:  total,
    new_customers:           newC,
    existing_customers:      total - newC,
    repeat_purchase_rate:    total > 0
      ? ((a.repeat_purchase_rate / 100 * a.total_unique_customers
        + b.repeat_purchase_rate / 100 * b.total_unique_customers) / total) * 100
      : 0,
    avg_orders_per_customer: total > 0 ? allOrders / total : 0,
    avg_spend_per_customer:  total > 0 ? allSpend  / total : 0,
    top_locations,
    capped: a.capped || b.capped,
    location_coverage: {
      orders_with_state: a.location_coverage.orders_with_state + b.location_coverage.orders_with_state,
      total_paid_orders: a.location_coverage.total_paid_orders + b.location_coverage.total_paid_orders,
    },
  };
}

export default function CustomersSection({ dateRange, refreshKey, platform, hasShopee, hasTikTok }: Props) {
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const from = Math.floor(dateRange.from.getTime() / 1000);
      const to = Math.floor(dateRange.to.getTime() / 1000);
      const qs = `from=${from}&to=${to}`;

      if (platform === 'all' && hasShopee && hasTikTok) {
        const [shopeeRes, tiktokRes] = await Promise.all([
          fetch(`/api/shopee/customers?${qs}`),
          fetch(`/api/tiktok/customers?${qs}`),
        ]);
        const [s, t]: [CustomerData, CustomerData] = await Promise.all([
          shopeeRes.json(),
          tiktokRes.json(),
        ]);
        setData(mergeCustomers(s, t));
      } else {
        const url = platform === 'tiktok' ? `/api/tiktok/customers?${qs}` : `/api/shopee/customers?${qs}`;
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

  const chartHeight = Math.max(200, (data?.top_locations.length ?? 0) * 40);

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
          <div className="flex items-baseline gap-2 mb-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Orders by State</p>
            {data.location_coverage && data.location_coverage.total_paid_orders > 0 && (
              <p className="text-xs text-gray-400">
                {data.location_coverage.orders_with_state} of {data.location_coverage.total_paid_orders} paid orders have location data
              </p>
            )}
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart layout="vertical" data={data.top_locations} margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
              <YAxis type="category" dataKey="state" width={120} tick={{ fontSize: 12 }} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [v, 'Orders']} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#f97316" />
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
