'use client';

import { useState } from 'react';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import TimeFilter, { type DateRange } from './TimeFilter';
import RevenueSection from './RevenueSection';
import OrdersSection from './OrdersSection';
import ProductsSection from './ProductsSection';
import AdsSection from './AdsSection';
import CustomersSection from './CustomersSection';
import FeesSection from './FeesSection';

export type Platform = 'all' | 'shopee' | 'tiktok';

interface Props {
  hasShopee: boolean;
  hasTikTok: boolean;
}

export default function Dashboard({ hasShopee, hasTikTok }: Props) {
  const bothConnected = hasShopee && hasTikTok;

  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 6)),
    to: endOfDay(new Date()),
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [platform, setPlatform] = useState<Platform>(
    hasShopee ? (hasTikTok ? 'all' : 'shopee') : 'tiktok'
  );

  function handleRefresh() {
    setRefreshKey(k => k + 1);
    setLastUpdated(new Date());
  }

  function handleRangeChange(range: DateRange) {
    setDateRange(range);
    setRefreshKey(k => k + 1);
    setLastUpdated(new Date());
  }

  const minutesAgo = Math.floor((Date.now() - lastUpdated.getTime()) / 60_000);

  // Sections that need live Shopee API (not TikTok) — hide when viewing TikTok-only
  const showShopeeAds = platform === 'shopee' || platform === 'all';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-8">
              <h1 className="text-lg font-semibold text-gray-900">Sales Dashboard</h1>
              <nav className="flex gap-6">
                <a href="/upload" className="text-sm text-gray-600 hover:text-orange-500">
                  Upload
                </a>
                <a href="/reconciliation" className="text-sm text-gray-600 hover:text-orange-500">
                  Reconciliation
                </a>
                <a href="/connect" className="text-sm text-gray-600 hover:text-orange-500">
                  Connect
                </a>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {minutesAgo === 0 ? 'Updated just now' : `Updated ${minutesAgo}m ago`}
              </span>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <TimeFilter onChange={handleRangeChange} />

            {/* Platform filter — only shown when both platforms are connected */}
            {bothConnected && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 ml-4 shrink-0">
                {(['all', 'shopee', 'tiktok'] as Platform[]).map(p => (
                  <button
                    key={p}
                    onClick={() => { setPlatform(p); setRefreshKey(k => k + 1); }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      platform === p
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {p === 'all' ? 'All Platforms' : p === 'shopee' ? 'Shopee' : 'TikTok Shop'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <RevenueSection dateRange={dateRange} refreshKey={refreshKey} platform={platform} hasShopee={hasShopee} hasTikTok={hasTikTok} />
        </div>
        <div className="lg:col-span-2">
          <FeesSection dateRange={dateRange} refreshKey={refreshKey} platform={platform} hasShopee={hasShopee} hasTikTok={hasTikTok} />
        </div>
        {showShopeeAds && (
          <div className="lg:col-span-2">
            <AdsSection dateRange={dateRange} refreshKey={refreshKey} />
          </div>
        )}
        <OrdersSection dateRange={dateRange} refreshKey={refreshKey} platform={platform} hasShopee={hasShopee} hasTikTok={hasTikTok} />
        <ProductsSection dateRange={dateRange} refreshKey={refreshKey} platform={platform} hasShopee={hasShopee} hasTikTok={hasTikTok} />
        <div className="lg:col-span-2">
          <CustomersSection dateRange={dateRange} refreshKey={refreshKey} platform={platform} hasShopee={hasShopee} hasTikTok={hasTikTok} />
        </div>
      </main>
    </div>
  );
}
