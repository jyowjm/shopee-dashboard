'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { DateRange } from './TimeFilter';
import type { OrdersData, Platform } from '@/types/dashboard';
import { STATUS_COLOR_HEX, SectionSkeleton, SectionError } from './_shared';
import { useFetch } from './use-fetch';
import { fetchJson } from '@/lib/api-fetch';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
  platform: Platform;
  hasShopee: boolean;
  hasTikTok: boolean;
}

function mergeOrders(a: OrdersData, b: OrdersData): OrdersData {
  const by_status = { ...a.by_status };
  for (const [k, v] of Object.entries(b.by_status)) {
    by_status[k] = (by_status[k] ?? 0) + v;
  }
  return { total: a.total + b.total, by_status };
}

export default function OrdersSection({
  dateRange,
  refreshKey,
  platform,
  hasShopee,
  hasTikTok,
}: Props) {
  const { data, loading, error, retry } = useFetch<OrdersData>(async () => {
    const from = Math.floor(dateRange.from.getTime() / 1000);
    const to = Math.floor(dateRange.to.getTime() / 1000);
    const qs = `from=${from}&to=${to}`;

    if (platform === 'all' && hasShopee && hasTikTok) {
      const [s, t] = await Promise.all([
        fetchJson<OrdersData>(`/api/shopee/orders?${qs}`),
        fetchJson<OrdersData>(`/api/tiktok/orders?${qs}`),
      ]);
      return mergeOrders(s, t);
    }
    const url = platform === 'tiktok' ? `/api/tiktok/orders?${qs}` : `/api/shopee/orders?${qs}`;
    return fetchJson<OrdersData>(url);
  }, [dateRange, refreshKey, platform, hasShopee, hasTikTok]);

  if (loading) return <SectionSkeleton titleWidth="w-20" />;
  if (error) return <SectionError title="Orders" message={error} onRetry={retry} />;

  const chartData = Object.entries(data?.by_status ?? {}).map(([status, count]) => ({
    name: status,
    value: count,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Orders</h2>
      <p className="text-3xl font-bold text-gray-900 mb-6">{data?.total}</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={STATUS_COLOR_HEX[entry.name] ?? '#d1d5db'} />
            ))}
          </Pie>
          <Tooltip formatter={(v, name) => [`${v}`, String(name ?? '').replace(/_/g, ' ')]} />
          <Legend formatter={(v: string) => v.replace(/_/g, ' ')} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
