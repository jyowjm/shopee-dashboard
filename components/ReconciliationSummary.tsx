'use client';

interface Props {
  totalExpected: number;
  totalActual: number;
  totalDiff: number;
  discrepancyCount: number;
  totalOrders: number;
}

function fmt(n: number) {
  return `RM${Math.abs(n).toFixed(2)}`;
}

export default function ReconciliationSummary({
  totalExpected,
  totalActual,
  totalDiff,
  discrepancyCount,
  totalOrders,
}: Props) {
  const isOvercharged = totalDiff > 0;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-1">Expected Fees</p>
        <p className="text-xl font-semibold text-gray-800">{fmt(totalExpected)}</p>
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-1">Actual Fees</p>
        <p className="text-xl font-semibold text-gray-800">{fmt(totalActual)}</p>
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-1">Total Discrepancy</p>
        <p
          className={`text-xl font-semibold ${Math.abs(totalDiff) < 0.02 ? 'text-green-600' : isOvercharged ? 'text-red-600' : 'text-amber-600'}`}
        >
          {totalDiff >= 0 ? '+' : '-'}
          {fmt(totalDiff)}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {Math.abs(totalDiff) < 0.02
            ? 'No discrepancy'
            : isOvercharged
              ? 'Overcharged'
              : 'Undercharged'}
        </p>
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-1">Orders w/ Discrepancies</p>
        <p className="text-xl font-semibold text-gray-800">
          {discrepancyCount} <span className="text-sm text-gray-400">/ {totalOrders}</span>
        </p>
      </div>
    </div>
  );
}
