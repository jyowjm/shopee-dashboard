import { callShopee } from '@/lib/shopee';
import type { ShopeeOrderSummary } from '@/types/shopee';

const CHUNK_SECONDS = 15 * 24 * 60 * 60; // 15-day max per Shopee API

export async function fetchOrderSummaries(
  from: number,
  to: number,
  cap = 500,
  timeRangeField: 'create_time' | 'update_time' = 'create_time'
): Promise<{ orders: ShopeeOrderSummary[]; capped: boolean }> {
  // Split into ≤15-day windows
  const chunks: Array<{ from: number; to: number }> = [];
  let start = from;
  while (start < to) {
    chunks.push({ from: start, to: Math.min(start + CHUNK_SECONDS, to) });
    start += CHUNK_SECONDS;
  }

  const allOrders: ShopeeOrderSummary[] = [];

  for (const chunk of chunks) {
    if (allOrders.length >= cap) break;
    let cursor = '';
    let more = true;
    while (more && allOrders.length < cap) {
      const data = await callShopee<{ order_list: ShopeeOrderSummary[]; more: boolean; next_cursor: string }>(
        '/api/v2/order/get_order_list',
        {
          time_range_field: timeRangeField,
          time_from: chunk.from,
          time_to: chunk.to,
          page_size: 100,
          response_optional_fields: 'order_status',
          ...(cursor ? { cursor } : {}),
        }
      );
      allOrders.push(...(data.order_list ?? []));
      more = data.more ?? false;
      cursor = data.next_cursor ?? '';
    }
  }

  const capped = allOrders.length >= cap;
  return { orders: allOrders.slice(0, cap), capped };
}
