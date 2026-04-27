'use client';

import { useState } from 'react';
import type { DateRange } from './TimeFilter';
import type { FeesData, Platform } from '@/types/dashboard';
import { getPrevPeriodLabel, DeltaBadge, SectionError } from './_shared';
import { useFetch } from './use-fetch';
import { fetchJson } from '@/lib/api-fetch';

interface Props {
  dateRange: DateRange;
  refreshKey: number;
  platform: Platform;
  hasShopee: boolean;
  hasTikTok: boolean;
}

function mergeFees(a: FeesData, b: FeesData): FeesData {
  const net_payout = a.net_payout + b.net_payout;
  const gross_revenue = a.gross_revenue + b.gross_revenue;
  const total_fees = a.total_fees + b.total_fees;
  return {
    net_payout,
    gross_revenue,
    total_fees,
    fee_rate: gross_revenue > 0 ? (total_fees / gross_revenue) * 100 : 0,
    breakdown: {
      commission_fee: a.breakdown.commission_fee + b.breakdown.commission_fee,
      service_fee: a.breakdown.service_fee + b.breakdown.service_fee,
      transaction_fee: a.breakdown.transaction_fee + b.breakdown.transaction_fee,
      affiliate_fee: a.breakdown.affiliate_fee + b.breakdown.affiliate_fee,
      tax_amount: a.breakdown.tax_amount + b.breakdown.tax_amount,
      shipping_fee: a.breakdown.shipping_fee + b.breakdown.shipping_fee,
      adjustment: a.breakdown.adjustment + b.breakdown.adjustment,
    },
    capped: a.capped || b.capped,
    prev_net_payout: a.prev_net_payout + b.prev_net_payout,
    prev_total_fees: a.prev_total_fees + b.prev_total_fees,
    has_estimates: (a.has_estimates ?? false) || (b.has_estimates ?? false),
    unsettled_count: (a.unsettled_count ?? 0) + (b.unsettled_count ?? 0),
  };
}

export default function FeesSection({
  dateRange,
  refreshKey,
  platform,
  hasShopee,
  hasTikTok,
}: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { data, loading, error, retry } = useFetch<FeesData>(async () => {
    const from = Math.floor(dateRange.from.getTime() / 1000);
    const to = Math.floor(dateRange.to.getTime() / 1000);
    const presetParam = dateRange.preset ? `&preset=${dateRange.preset}` : '';
    const qs = `from=${from}&to=${to}${presetParam}`;

    if (platform === 'all' && hasShopee && hasTikTok) {
      const [s, t] = await Promise.all([
        fetchJson<FeesData>(`/api/shopee/fees?${qs}`),
        fetchJson<FeesData>(`/api/tiktok/fees?${qs}`),
      ]);
      return mergeFees(s, t);
    }
    const url = platform === 'tiktok' ? `/api/tiktok/fees?${qs}` : `/api/shopee/fees?${qs}`;
    return fetchJson<FeesData>(url);
  }, [dateRange, refreshKey, platform, hasShopee, hasTikTok]);

  if (loading)
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-16 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );

  if (error) return <SectionError title="Fees" message={error} onRetry={retry} />;

  const periodLabel = getPrevPeriodLabel(dateRange);
  const rm = (n: number) => `RM ${n.toFixed(2)}`;

  // Fee rows — these sum to total_fees
  const feeRows: { label: string; value: number }[] = data
    ? (() => {
        if (platform === 'tiktok') {
          return (
            [
              { label: 'Referral Fee', value: data.breakdown.commission_fee },
              { label: 'Transaction Fee', value: data.breakdown.transaction_fee },
              { label: 'Affiliate Commission', value: data.breakdown.affiliate_fee },
              { label: 'Service Fees', value: data.breakdown.service_fee },
              { label: 'Tax (SST / VAT)', value: data.breakdown.tax_amount },
            ] as { label: string; value: number }[]
          ).filter((r) => r.value > 0);
        }
        if (platform === 'shopee') {
          return [
            { label: 'Commission Fee', value: data.breakdown.commission_fee },
            ...(data.breakdown.service_fee > 0
              ? [{ label: 'Service Fee', value: data.breakdown.service_fee }]
              : []),
            { label: 'Transaction / Payment Fee', value: data.breakdown.transaction_fee },
          ];
        }
        // all platforms
        return (
          [
            { label: 'Commission / Referral Fee', value: data.breakdown.commission_fee },
            { label: 'Transaction Fee', value: data.breakdown.transaction_fee },
            { label: 'Service Fees', value: data.breakdown.service_fee },
            { label: 'Affiliate Commission', value: data.breakdown.affiliate_fee },
            { label: 'Tax (SST / VAT)', value: data.breakdown.tax_amount },
          ] as { label: string; value: number }[]
        ).filter((r) => r.value > 0);
      })()
    : [];

  // Other settlement items (TikTok-specific) — informational, not included in total_fees
  const otherRows: { label: string; value: number }[] = data
    ? [
        ...(data.breakdown.shipping_fee > 0
          ? [{ label: 'Shipping', value: data.breakdown.shipping_fee }]
          : []),
        ...(data.breakdown.adjustment !== 0
          ? [{ label: 'Adjustments', value: data.breakdown.adjustment }]
          : []),
      ]
    : [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Fees</h2>

      {data?.capped && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mb-4">
          Showing data for first 500 orders — narrow your date range for full accuracy.
        </p>
      )}

      {data?.has_estimates && (
        <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-3 py-1.5 mb-4">
          Includes estimated fees for {data.unsettled_count} unsettled order
          {data.unsettled_count !== 1 ? 's' : ''} — figures will update once orders settle.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Net Payout</p>
          <div className="flex items-start gap-2">
            <p className="text-2xl font-bold text-gray-900">{rm(data?.net_payout ?? 0)}</p>
            {data && (
              <DeltaBadge
                current={data.net_payout}
                previous={data.prev_net_payout}
                periodLabel={periodLabel}
              />
            )}
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Total Fees</p>
          <div className="flex items-start gap-2">
            <p className="text-2xl font-bold text-gray-900">{rm(data?.total_fees ?? 0)}</p>
            {data && (
              <DeltaBadge
                current={data.total_fees}
                previous={data.prev_total_fees}
                periodLabel={periodLabel}
              />
            )}
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Fee Rate</p>
          <p className="text-2xl font-bold text-gray-900">{(data?.fee_rate ?? 0).toFixed(1)}%</p>
          <p className="text-xs text-gray-400 mt-0.5">of gross {rm(data?.gross_revenue ?? 0)}</p>
        </div>
      </div>

      <button
        onClick={() => setShowBreakdown((v) => !v)}
        className="text-xs font-medium text-orange-600 uppercase tracking-wide hover:text-orange-700"
      >
        {showBreakdown ? 'Hide breakdown ▲' : 'Show breakdown ▼'}
      </button>

      {showBreakdown && (
        <table className="w-full text-sm mt-3 max-w-sm">
          <tbody>
            {feeRows.map(({ label, value }) => (
              <tr key={label} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 text-gray-600">{label}</td>
                <td className="py-1.5 text-right font-medium text-gray-900">{rm(value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200">
              <td className="pt-2 text-sm font-semibold text-gray-700">Total Fees</td>
              <td className="pt-2 text-right font-bold text-gray-900">
                {rm(data?.total_fees ?? 0)}
              </td>
            </tr>
            {otherRows.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={2}
                    className="pt-4 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wide"
                  >
                    Other Settlement Items
                  </td>
                </tr>
                {otherRows.map(({ label, value }) => (
                  <tr key={label}>
                    <td className="py-1 text-gray-600">{label}</td>
                    <td
                      className={`py-1 text-right font-medium ${value < 0 ? 'text-red-600' : 'text-gray-900'}`}
                    >
                      {value < 0 ? `−${rm(Math.abs(value))}` : rm(value)}
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tfoot>
        </table>
      )}
    </div>
  );
}
