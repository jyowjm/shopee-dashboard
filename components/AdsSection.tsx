'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import type { DateRange } from './TimeFilter';
import type { AdsData } from '@/types/shopee';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
}

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdsSection({ dateRange, refreshKey }: Props) {
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const start = format(dateRange.from, 'dd-MM-yyyy');
      const end = format(dateRange.to, 'dd-MM-yyyy');
      const res = await fetch(`/api/shopee/ads?start_date=${start}&end_date=${end}`);
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Ads Performance</h2>
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={load} className="mt-2 text-xs text-orange-500 underline">Retry</button>
      </div>
    );
  }

  const noSpend = !data || data.total_spend === 0;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Ads Performance</h2>

      {noSpend ? (
        <p className="text-sm text-gray-400">No ad spend recorded for this period.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-gray-400 mb-1">Ad Spend</p>
            <p className="text-2xl font-bold text-gray-900">RM {fmt(data!.total_spend)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Ad Revenue</p>
            <p className="text-2xl font-bold text-gray-900">RM {fmt(data!.ad_revenue)}</p>
            <p className="text-xs text-gray-400 mt-0.5">7-day attribution</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">ROAS</p>
            <p className="text-2xl font-bold text-orange-500">{data!.roas.toFixed(2)}x</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {data!.clicks.toLocaleString()} clicks · {data!.impressions.toLocaleString()} impressions
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
