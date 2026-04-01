'use client';

import { useEffect, useState } from 'react';
import type { ShopHealthData } from '@/types/shopee';

interface Props {
  refreshKey: number;
  onShopLoaded?: (name: string, logo: string) => void;
}

export default function ShopHealthSection({ refreshKey, onShopLoaded }: Props) {
  const [data, setData] = useState<ShopHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/shopee/shop');
      if (res.status === 401) { window.location.href = '/connect'; return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const d: ShopHealthData = await res.json();
      setData(d);
      onShopLoaded?.(d.shop_name, d.shop_logo);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  if (loading) return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-28 mb-4" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 bg-gray-100 rounded" />
        <div className="h-20 bg-gray-100 rounded" />
        <div className="h-20 bg-gray-100 rounded" />
        <div className="h-20 bg-gray-100 rounded" />
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Shop Health</h2>
      <p className="text-sm text-red-600 mb-3">{error}</p>
      <button onClick={load} className="text-sm text-orange-600 underline">Retry</button>
    </div>
  );

  const metrics = [
    { label: 'Overall Rating', value: data?.rating?.toFixed(1) ?? '—', suffix: '/ 5', good: (data?.rating ?? 0) >= 4 },
    { label: 'Cancellation Rate', value: data?.cancellation_rate != null ? `${data.cancellation_rate.toFixed(1)}%` : '—', good: (data?.cancellation_rate ?? 0) < 5 },
    { label: 'Response Rate', value: data?.response_rate != null ? `${data.response_rate.toFixed(1)}%` : '—', good: (data?.response_rate ?? 0) >= 80 },
    { label: 'Late Shipment Rate', value: data?.late_shipment_rate != null ? `${data.late_shipment_rate.toFixed(1)}%` : '—', good: (data?.late_shipment_rate ?? 0) < 5 },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Shop Health</h2>
      <p className="text-xs text-gray-400 mb-4">Rolling metrics — not date-range filtered.</p>
      <div className="grid grid-cols-2 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">{m.label}</p>
            <p className={`text-xl font-bold ${m.good ? 'text-green-600' : 'text-red-500'}`}>
              {m.value} <span className="text-xs font-normal text-gray-400">{m.suffix}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
