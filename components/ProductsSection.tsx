'use client';

import { useEffect, useState } from 'react';
import type { DateRange } from './TimeFilter';
import type { ProductData } from '@/types/shopee';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
}

export default function ProductsSection({ dateRange, refreshKey }: Props) {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'revenue' | 'units_sold'>('revenue');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const from = Math.floor(dateRange.from.getTime() / 1000);
      const to = Math.floor(dateRange.to.getTime() / 1000);
      const res = await fetch(`/api/shopee/products?from=${from}&to=${to}`);
      if (res.status === 401) { window.location.href = '/connect'; return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [dateRange, refreshKey]);

  const sorted = [...products].sort((a, b) => b[sortBy] - a[sortBy]);

  if (loading) return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-28 mb-4" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );

  if (error) return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Top Products</h2>
      <p className="text-sm text-red-600 mb-3">{error}</p>
      <button onClick={load} className="text-sm text-orange-600 underline">Retry</button>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Top Products</h2>
        <div className="flex gap-1">
          {(['revenue', 'units_sold'] as const).map(key => (
            <button key={key} onClick={() => setSortBy(key)} className={`text-xs px-2 py-1 rounded ${sortBy === key ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {key === 'revenue' ? 'Revenue' : 'Units'}
            </button>
          ))}
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No orders in this period.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="pb-2 font-medium">#</th>
              <th className="pb-2 font-medium">Product</th>
              <th className="pb-2 font-medium text-right">Units</th>
              <th className="pb-2 font-medium text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.item_id} className="border-b border-gray-50 last:border-0">
                <td className="py-2 text-gray-400">{i + 1}</td>
                <td className="py-2 text-gray-800 max-w-xs truncate">{p.name}</td>
                <td className="py-2 text-right text-gray-600">{p.units_sold}</td>
                <td className="py-2 text-right font-medium">${p.revenue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
