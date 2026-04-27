'use client';

import { useState, useEffect, useCallback } from 'react';
import ReconciliationSummary from '@/components/ReconciliationSummary';
import ReconciliationTable from '@/components/ReconciliationTable';
import { summariseReconResults } from '@/lib/reconciliation-engine';
import type { PayoutPeriod, PayoutOrder } from '@/types/reconciliation';

export default function ReconciliationPage() {
  const [periods, setPeriods] = useState<PayoutPeriod[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [orders, setOrders] = useState<PayoutOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchFrom, setFetchFrom] = useState('');
  const [fetchTo, setFetchTo] = useState('');

  const activePeriod = periods.find((p) => p.id === activePeriodId) ?? null;

  useEffect(() => {
    fetch('/api/reconciliation/periods')
      .then((r) => r.json())
      .then((data) => {
        setPeriods(data);
        if (data.length > 0) setActivePeriodId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!activePeriodId) return;
    setLoading(true);
    fetch(`/api/reconciliation/orders?period_id=${activePeriodId}`)
      .then((r) => r.json())
      .then((data) => {
        setOrders(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activePeriodId]);

  async function handleXlsxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/reconciliation/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setUploading(false);
      return;
    }
    const periodsRes = await fetch('/api/reconciliation/periods');
    const newPeriods = await periodsRes.json();
    setPeriods(newPeriods);
    setActivePeriodId(data.period_id);
    setUploading(false);
    e.target.value = '';
  }

  async function handleApiFetch() {
    if (!fetchFrom || !fetchTo) {
      setError('Please enter both from and to dates');
      return;
    }
    setFetching(true);
    setError(null);
    const res = await fetch('/api/reconciliation/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_date: fetchFrom, to_date: fetchTo }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setFetching(false);
      return;
    }
    const periodsRes = await fetch('/api/reconciliation/periods');
    const newPeriods = await periodsRes.json();
    setPeriods(newPeriods);
    setActivePeriodId(data.period_id);
    setFetching(false);
  }

  const handleStatusUpdate = useCallback(
    async (orderSn: string, status: PayoutOrder['status'], notes: string) => {
      await fetch(`/api/reconciliation/notes/${orderSn}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: activePeriodId, status, notes }),
      });
      setOrders((prev) => prev.map((o) => (o.order_sn === orderSn ? { ...o, status, notes } : o)));
    },
    [activePeriodId],
  );

  const {
    total_expected: totalExpected,
    total_actual: totalActual,
    total_diff: totalDiff,
  } = summariseReconResults(orders);
  const discrepancies = orders.filter((o) => o.has_discrepancy).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Fee Reconciliation</h1>
        {periods.length > 0 && (
          <select
            value={activePeriodId ?? ''}
            onChange={(e) => setActivePeriodId(e.target.value)}
            className="text-sm border rounded px-3 py-1.5"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.period_from} → {p.period_to} ({p.source.toUpperCase()})
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-4 mb-6 p-4 rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Upload Payout Report:</label>
          <label className="cursor-pointer rounded bg-orange-500 px-3 py-1.5 text-sm text-white hover:bg-orange-600">
            {uploading ? 'Uploading…' : 'Choose XLSX'}
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleXlsxUpload}
              disabled={uploading}
            />
          </label>
        </div>
        <div className="w-px bg-gray-200 self-stretch" />
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm font-medium text-gray-700">Fetch from API:</label>
          <input
            type="date"
            value={fetchFrom}
            onChange={(e) => setFetchFrom(e.target.value)}
            className="text-sm border rounded px-2 py-1"
          />
          <span className="text-gray-400">→</span>
          <input
            type="date"
            value={fetchTo}
            onChange={(e) => setFetchTo(e.target.value)}
            className="text-sm border rounded px-2 py-1"
          />
          <button
            onClick={handleApiFetch}
            disabled={fetching}
            className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {fetching ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {activePeriod && (
        <p className="text-sm text-gray-500 mb-4">
          {activePeriod.period_from} – {activePeriod.period_to} ·{' '}
          {activePeriod.source.toUpperCase()} · {orders.length} orders
        </p>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading orders…</div>
      ) : orders.length > 0 ? (
        <>
          <ReconciliationSummary
            totalExpected={totalExpected}
            totalActual={totalActual}
            totalDiff={totalDiff}
            discrepancyCount={discrepancies}
            totalOrders={orders.length}
          />
          <ReconciliationTable
            orders={orders}
            periodId={activePeriodId!}
            onStatusUpdate={handleStatusUpdate}
          />
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">
          Upload a payout report or fetch from the API to start reconciling.
        </div>
      )}
    </div>
  );
}
