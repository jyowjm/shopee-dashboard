'use client';

import { useState } from 'react';
import type { DateRange } from './TimeFilter';
import type { ProductData, Platform } from '@/types/dashboard';
import { SectionSkeleton, SectionError } from './_shared';
import { useFetch } from './use-fetch';
import { fetchJson } from '@/lib/api-fetch';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
  platform: Platform;
  hasShopee: boolean;
  hasTikTok: boolean;
  includeTikTokShipping?: boolean;
}

function mergeByName(s: ProductData[], t: ProductData[]): ProductData[] {
  // Cross-platform products have different IDs, so merge by lowercased name.
  const nameMap = new Map<string, ProductData>();
  for (const p of [...s, ...t]) {
    const key = p.name.toLowerCase().trim();
    const ex = nameMap.get(key);
    if (ex) {
      ex.units_sold += p.units_sold;
      ex.revenue += p.revenue;
    } else {
      nameMap.set(key, { ...p });
    }
  }
  return [...nameMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
}

export default function ProductsSection({
  dateRange,
  refreshKey,
  platform,
  hasShopee,
  hasTikTok,
  includeTikTokShipping,
}: Props) {
  const [sortBy, setSortBy] = useState<'revenue' | 'units_sold'>('revenue');

  const {
    data: products,
    loading,
    error,
    retry,
  } = useFetch<ProductData[]>(async () => {
    const from = Math.floor(dateRange.from.getTime() / 1000);
    const to = Math.floor(dateRange.to.getTime() / 1000);
    const qs = `from=${from}&to=${to}`;
    const tiktokQs = `${qs}${includeTikTokShipping ? '&includeShipping=true' : ''}`;

    if (platform === 'all' && hasShopee && hasTikTok) {
      const [s, t] = await Promise.all([
        fetchJson<{ products?: ProductData[] }>(`/api/shopee/products?${qs}`),
        fetchJson<{ products?: ProductData[] }>(`/api/tiktok/products?${tiktokQs}`),
      ]);
      return mergeByName(s.products ?? [], t.products ?? []);
    }
    const url =
      platform === 'tiktok' ? `/api/tiktok/products?${tiktokQs}` : `/api/shopee/products?${qs}`;
    const data = await fetchJson<{ products?: ProductData[] }>(url);
    return data.products ?? [];
  }, [dateRange, refreshKey, platform, hasShopee, hasTikTok, includeTikTokShipping]);

  const sorted = [...(products ?? [])].sort((a, b) => b[sortBy] - a[sortBy]);

  if (loading) return <SectionSkeleton titleWidth="w-28" />;
  if (error) return <SectionError title="Top Products" message={error} onRetry={retry} />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Top Products</h2>
        <div className="flex gap-1">
          {(['revenue', 'units_sold'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`text-xs px-2 py-1 rounded ${sortBy === key ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
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
