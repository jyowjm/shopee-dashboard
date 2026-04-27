'use client';

import { useState } from 'react';
import type { PayoutOrder } from '@/types/reconciliation';

interface Props {
  orders: PayoutOrder[];
  periodId: string;
  onStatusUpdate: (orderSn: string, status: PayoutOrder['status'], notes: string) => void;
}

function DiffCell({ expected, actual, diff }: { expected: number; actual: number; diff: number }) {
  const isDiscrepancy = Math.abs(diff) >= 0.02;
  return (
    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
      <span className="text-gray-500">{actual.toFixed(2)}</span>
      {isDiscrepancy && (
        <span className={`ml-1 font-medium ${diff > 0 ? 'text-red-600' : 'text-amber-600'}`}>
          {diff > 0 ? '+' : ''}
          {diff.toFixed(2)}
        </span>
      )}
    </td>
  );
}

function StatusBadge({ status }: { status: PayoutOrder['status'] }) {
  const colours = {
    unreviewed: 'bg-gray-100 text-gray-600',
    investigating: 'bg-amber-100 text-amber-700',
    resolved: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colours[status]}`}>
      {status}
    </span>
  );
}

function OrderRow({
  order,
  periodId,
  onStatusUpdate,
}: {
  order: PayoutOrder;
  periodId: string;
  onStatusUpdate: Props['onStatusUpdate'];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editStatus, setEditStatus] = useState(order.status);
  const [editNotes, setEditNotes] = useState(order.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onStatusUpdate(order.order_sn, editStatus, editNotes);
    setSaving(false);
  }

  return (
    <>
      <tr
        className={`border-b cursor-pointer hover:bg-gray-50 ${order.has_discrepancy ? 'bg-amber-50' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2 text-xs font-mono">{order.order_sn}</td>
        <td className="px-3 py-2 text-xs text-gray-500">{order.payout_date}</td>
        <DiffCell
          expected={order.commission_expected}
          actual={order.commission_actual}
          diff={order.commission_diff}
        />
        <DiffCell
          expected={order.transaction_expected}
          actual={order.transaction_actual}
          diff={order.transaction_diff}
        />
        <DiffCell
          expected={order.platform_support_expected}
          actual={order.platform_support_actual}
          diff={order.platform_support_diff}
        />
        <DiffCell
          expected={order.cashback_expected}
          actual={order.cashback_actual}
          diff={order.cashback_diff}
        />
        <DiffCell expected={order.ams_expected} actual={order.ams_actual} diff={order.ams_diff} />
        <td className="px-3 py-2">
          <StatusBadge status={order.status} />
        </td>
        <td className="px-3 py-2 text-xs text-center">{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 border-b">
          <td colSpan={9} className="px-4 py-3">
            <div className="flex flex-wrap gap-4 items-start">
              <div className="text-xs space-y-1 flex-1 min-w-48">
                <p className="font-medium text-gray-700 mb-1">Fee Breakdown</p>
                {[
                  {
                    label: 'Commission',
                    exp: order.commission_expected,
                    act: order.commission_actual,
                    diff: order.commission_diff,
                  },
                  {
                    label: 'Transaction',
                    exp: order.transaction_expected,
                    act: order.transaction_actual,
                    diff: order.transaction_diff,
                  },
                  {
                    label: 'Platform Support',
                    exp: order.platform_support_expected,
                    act: order.platform_support_actual,
                    diff: order.platform_support_diff,
                  },
                  {
                    label: 'Cashback',
                    exp: order.cashback_expected,
                    act: order.cashback_actual,
                    diff: order.cashback_diff,
                  },
                  {
                    label: 'AMS',
                    exp: order.ams_expected,
                    act: order.ams_actual,
                    diff: order.ams_diff,
                  },
                ].map(({ label, exp, act, diff }) => (
                  <div key={label} className="flex gap-2">
                    <span className="w-32 text-gray-500">{label}</span>
                    <span>Exp: RM{exp.toFixed(2)}</span>
                    <span>Act: RM{act.toFixed(2)}</span>
                    {Math.abs(diff) >= 0.02 && (
                      <span className={diff > 0 ? 'text-red-600' : 'text-amber-600'}>
                        Δ {diff > 0 ? '+' : ''}
                        {diff.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 min-w-48">
                <p className="text-xs font-medium text-gray-700">Status</p>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as PayoutOrder['status'])}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="unreviewed">Unreviewed</option>
                  <option value="investigating">Investigating</option>
                  <option value="resolved">Resolved</option>
                </select>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes..."
                  className="text-xs border rounded px-2 py-1 h-16 resize-none"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    save();
                  }}
                  disabled={saving}
                  className="text-xs bg-orange-500 text-white rounded px-3 py-1 hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ReconciliationTable({ orders, periodId, onStatusUpdate }: Props) {
  const [filter, setFilter] = useState<'all' | 'discrepancies' | 'investigating' | 'resolved'>(
    'all',
  );

  const filtered = orders.filter((o) => {
    if (filter === 'discrepancies') return o.has_discrepancy;
    if (filter === 'investigating') return o.status === 'investigating';
    if (filter === 'resolved') return o.status === 'resolved';
    return true;
  });

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {(['all', 'discrepancies', 'investigating', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs rounded-full px-3 py-1 border ${filter === f ? 'bg-orange-500 text-white border-orange-500' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 self-center">{filtered.length} orders</span>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Order ID</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Comm.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Trans.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Platform</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Cashback</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">AMS</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
              <th className="px-3 py-2 w-6"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <OrderRow
                key={order.order_sn}
                order={order}
                periodId={periodId}
                onStatusUpdate={onStatusUpdate}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
