'use client';

import { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export type DateRange = { from: Date; to: Date; preset?: string };

interface TimeFilterProps {
  onChange: (range: DateRange) => void;
  disabled?: boolean;
}

const PRESETS = [
  { label: 'Today', getRange: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  {
    label: 'Yesterday',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 1)),
      to: endOfDay(subDays(new Date(), 1)),
    }),
  },
  {
    label: 'Last 7 days',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    label: 'Last 30 days',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  },
  {
    label: 'Last month',
    getRange: () => ({
      from: startOfMonth(subMonths(new Date(), 1)),
      to: endOfMonth(subMonths(new Date(), 1)),
      preset: 'last_month',
    }),
  },
  {
    label: 'This month',
    getRange: () => ({
      from: startOfMonth(new Date()),
      to: endOfDay(new Date()),
      preset: 'this_month',
    }),
  },
];

export default function TimeFilter({ onChange, disabled }: TimeFilterProps) {
  const [active, setActive] = useState<string>('Last 7 days');
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);

  function selectPreset(label: string, getRange: () => DateRange) {
    setActive(label);
    setCustomStart(null);
    setCustomEnd(null);
    onChange(getRange());
  }

  function applyCustom() {
    if (!customStart || !customEnd) return;
    setActive('custom');
    onChange({ from: startOfDay(customStart), to: endOfDay(customEnd) });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(({ label, getRange }) => (
        <button
          key={label}
          onClick={() => selectPreset(label, getRange)}
          disabled={disabled}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            active === label
              ? 'bg-orange-500 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          } disabled:opacity-50`}
        >
          {label}
        </button>
      ))}
      <div className="flex items-center gap-1 ml-1">
        <DatePicker
          selected={customStart}
          onChange={(date: Date | null) => setCustomStart(date)}
          selectsStart
          startDate={customStart}
          endDate={customEnd}
          placeholderText="From"
          className="border border-gray-200 rounded-md px-2 py-1.5 text-sm w-28"
          disabled={disabled}
        />
        <span className="text-gray-400">–</span>
        <DatePicker
          selected={customEnd}
          onChange={(date: Date | null) => setCustomEnd(date)}
          selectsEnd
          startDate={customStart}
          endDate={customEnd}
          minDate={customStart ?? undefined}
          placeholderText="To"
          className="border border-gray-200 rounded-md px-2 py-1.5 text-sm w-28"
          disabled={disabled}
        />
        <button
          onClick={applyCustom}
          disabled={!customStart || !customEnd || disabled}
          className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded-md disabled:opacity-40 hover:bg-gray-700"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
