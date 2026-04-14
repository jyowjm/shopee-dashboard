'use client';

import { useEffect, useState } from 'react';
import type { DateRange } from './TimeFilter';
import type { ProductData } from '@/types/shopee';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
  platform: 'all' | 'shopee' | 'tiktok';
  hasShopee: boolean;
  hasTikTok: boolean;
  includeTikTokShipping?: boolean;
}

export default function ProductsSection({ dateRange, refreshKey, platform, hasShopee, hasTikTok, includeTikTokShipping }: Props) {
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
      const qs = `from=${from}&to=${to}`;

      const tiktokQs = `${qs}${includeTikTokShipping ? '&includeShipping=true' : ''}`;

      if (platform === 'all' && hasShopee && hasTikTok) {
        const [shopeeRes, tiktokRes] = await Promise.all([
          fetch(`/api/shopee/products?${qs}`),
          fetch(`/api/tiktok/products?${tiktokQs}`),
        ]);
        const [s, t] = await Promise.all([shopeeRes.json(), tiktokRes.json()]);
        // Merge by item name (cross-platform products have different IDs)
        const nameMap = new Map<string, ProductData>();
        for (const p of [...(s.products ?? []), ...(t.products ?? [])]) {
          const key = p.name.toLowerCase().trim();
          const ex = nameMap.get(key);
          if (ex) {
            ex.units_sold += p.units_sold;
            ex.revenue    += p.revenue;
          } else {
            nameMap.set(key, { ...p });
          }
        }
        setProducts(Array.from(nameMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
      } else {
        const url = platform === 'tiktok' ? `/api/tiktok/products?${tiktokQs}` : `/api/shopee/products?${qs}`;
        const res = await fetch(url);
        if (res.status === 401) { throw new Error('Session expired — please reconnect your shop.'); }
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
        const data = await res.json();
        setProducts(data.products ?? []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [dateRange, refreshKey, includeTikTokShipping]);

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
                <td className="py-2 text-right font-medium">RM {p.revenue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
