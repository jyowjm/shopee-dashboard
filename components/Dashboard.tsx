'use client';

import { useState } from 'react';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import TimeFilter, { type DateRange } from './TimeFilter';
import RevenueSection from './RevenueSection';
import OrdersSection from './OrdersSection';
import ProductsSection from './ProductsSection';
import ShopHealthSection from './ShopHealthSection';
import AdsSection from './AdsSection';
import CustomersSection from './CustomersSection';

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 6)),
    to: endOfDay(new Date()),
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [shopName, setShopName] = useState('');
  const [shopLogo, setShopLogo] = useState('');

  function handleRefresh() {
    setRefreshKey(k => k + 1);
    setLastUpdated(new Date());
  }

  function handleRangeChange(range: DateRange) {
    setDateRange(range);
    setRefreshKey(k => k + 1);
    setLastUpdated(new Date());
  }

  function handleShopLoaded(name: string, logo: string) {
    setShopName(name);
    setShopLogo(logo);
  }

  const minutesAgo = Math.floor((Date.now() - lastUpdated.getTime()) / 60_000);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {shopLogo && <img src={shopLogo} alt={shopName} className="w-8 h-8 rounded-full object-cover" />}
              <h1 className="text-lg font-semibold text-gray-900">{shopName || 'Shopee Dashboard'}</h1>
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
          <TimeFilter onChange={handleRangeChange} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <RevenueSection dateRange={dateRange} refreshKey={refreshKey} />
        </div>
        <div className="lg:col-span-2">
          <AdsSection dateRange={dateRange} refreshKey={refreshKey} />
        </div>
        <OrdersSection dateRange={dateRange} refreshKey={refreshKey} />
        <ProductsSection dateRange={dateRange} refreshKey={refreshKey} />
        <div className="lg:col-span-2">
          <ShopHealthSection refreshKey={refreshKey} onShopLoaded={handleShopLoaded} />
        </div>
        <div className="lg:col-span-2">
          <CustomersSection dateRange={dateRange} refreshKey={refreshKey} />
        </div>
      </main>
    </div>
  );
}
