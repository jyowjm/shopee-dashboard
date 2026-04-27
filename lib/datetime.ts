import { format, subMonths } from 'date-fns';

// Malaysia time zone offset. All Shopee/TikTok timestamps are Unix seconds (UTC);
// daily date buckets and calendar-month math are done in MYT so they line up with
// the Malaysian seller calendar.
export const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Format a Unix-second timestamp as a YYYY-MM-DD date string in MYT. */
export function toMytDate(unixSeconds: number): string {
  return format(new Date(unixSeconds * 1000 + MYT_OFFSET_MS), 'yyyy-MM-dd');
}

/** Subtract one calendar month from a Unix-second timestamp, keeping the MYT calendar date correct. */
export function subOneMonthMyt(unixSeconds: number): number {
  const mytDate = new Date(unixSeconds * 1000 + MYT_OFFSET_MS);
  const shifted = subMonths(mytDate, 1);
  return Math.floor((shifted.getTime() - MYT_OFFSET_MS) / 1000);
}
