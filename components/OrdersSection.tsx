'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { DateRange } from './TimeFilter';
import type { OrdersData } from '@/types/shopee';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
  platform: 'all' | 'shopee' | 'tiktok';
  hasShopee: boolean;
  hasTikTok: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#22c55e',
  SHIPPED: '#3b82f6',
  READY_TO_SHIP: '#8b5cf6',
  PAID: '#f97316',
  CANCELLED: '#ef4444',
  IN_CANCEL: '#f59e0b',
  TO_RETURN: '#ec4899',
  UNPAID: '#9ca3af',
};

export default function OrdersSection({ dateRange, refreshKey, platform, hasShopee, hasTikTok }: Props) {
  const [data, setData] = useState<OrdersData | null>(null);
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
          fetch(`/api/shopee/orders?${qs}`),
          fetch(`/api/tiktok/orders?${qs}`),
        ]);
        const [s, t]: [OrdersData, OrdersData] = await Promise.all([shopeeRes.json(), tiktokRes.json()]);
        const by_status = { ...s.by_status };
        for (const [k, v] of Object.entries(t.by_status)) {
          by_status[k] = (by_status[k] ?? 0) + v;
        }
        setData({ total: s.total + t.total, by_status });
      } else {
        const url = platform === 'tiktok' ? `/api/tiktok/orders?${qs}` : `/api/shopee/orders?${qs}`;
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
      <div className="h-4 bg-gray-200 rounded w-20 mb-4" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );

  if (error) return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Orders</h2>
      <p className="text-sm text-red-600 mb-3">{error}</p>
      <button onClick={load} className="text-sm text-orange-600 underline">Retry</button>
    </div>
  );

  const chartData = Object.entries(data?.by_status ?? {}).map(([status, count]) => ({ name: status, value: count }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Orders</h2>
      <p className="text-3xl font-bold text-gray-900 mb-6">{data?.total}</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#d1d5db'} />
            ))}
          </Pie>
          <Tooltip formatter={(v, name) => [`${v}`, String(name ?? '').replace(/_/g, ' ')]} />
          <Legend formatter={(v: string) => v.replace(/_/g, ' ')} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
