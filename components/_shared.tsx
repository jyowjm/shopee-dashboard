'use client';

import { format, subMonths } from 'date-fns';
import type { DateRange } from './TimeFilter';

// Returns a human-readable label for the comparison period, e.g. "Apr 6", "Mar 1–8", "Mar 26 – Apr 1"
export function getPrevPeriodLabel(dateRange: DateRange): string {
  const { from, to, preset } = dateRange;
  const currentYear = new Date().getFullYear();

  let prevFrom: Date;
  let prevTo: Date;

  if (preset === 'this_month' || preset === 'last_month') {
    prevFrom = subMonths(from, 1);
    prevTo = subMonths(to, 1);
  } else {
    const duration = to.getTime() - from.getTime();
    prevFrom = new Date(from.getTime() - duration);
    prevTo = new Date(from.getTime() - 1);
  }

  const yearSuffix = (d: Date) => (d.getFullYear() !== currentYear ? `, ${d.getFullYear()}` : '');
  const prevToDisplay = new Date(prevTo.getTime() - 1);
  const fromLabel = format(prevFrom, 'MMM d') + yearSuffix(prevFrom);
  const toLabel = format(prevToDisplay, 'MMM d') + yearSuffix(prevToDisplay);

  if (fromLabel === toLabel) return fromLabel;
  if (format(prevFrom, 'MMM yyyy') === format(prevToDisplay, 'MMM yyyy')) {
    return `${format(prevFrom, 'MMM d')}–${format(prevToDisplay, 'd')}${yearSuffix(prevFrom)}`;
  }
  return `${fromLabel} – ${toLabel}`;
}

export function DeltaBadge({
  current,
  previous,
  periodLabel,
}: {
  current: number;
  previous: number;
  periodLabel: string;
}) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
      >
        {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
      </span>
      <span className="text-xs text-gray-400">vs {periodLabel}</span>
    </div>
  );
}

// Order status palette — single source of truth, exposed as both Tailwind text classes
// (used inline in tables) and hex codes (used by recharts cells).
export const STATUS_PALETTE = {
  COMPLETED: { tw: 'text-green-600', hex: '#22c55e' },
  SHIPPED: { tw: 'text-blue-600', hex: '#3b82f6' },
  READY_TO_SHIP: { tw: 'text-purple-600', hex: '#8b5cf6' },
  PAID: { tw: 'text-orange-500', hex: '#f97316' },
  CANCELLED: { tw: 'text-red-500', hex: '#ef4444' },
  IN_CANCEL: { tw: 'text-amber-500', hex: '#f59e0b' },
  TO_RETURN: { tw: 'text-pink-500', hex: '#ec4899' },
  UNPAID: { tw: 'text-gray-400', hex: '#9ca3af' },
} as const;

export const STATUS_COLOR_CLASSES: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_PALETTE).map(([k, v]) => [k, v.tw]),
);

export const STATUS_COLOR_HEX: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_PALETTE).map(([k, v]) => [k, v.hex]),
);

export function SectionSkeleton({
  titleWidth = 'w-20',
  extraClass = '',
}: {
  titleWidth?: string;
  extraClass?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-6 animate-pulse ${extraClass}`}>
      <div className={`h-4 bg-gray-200 rounded ${titleWidth} mb-4`} />
      <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );
}

export function SectionError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">{title}</h2>
      <p className="text-sm text-red-600 mb-3">{message}</p>
      <button onClick={onRetry} className="text-sm text-orange-600 underline">
        Retry
      </button>
    </div>
  );
}
