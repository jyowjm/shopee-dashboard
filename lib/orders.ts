import { callShopee } from '@/lib/shopee';
import type { ShopeeOrderSummary } from '@/types/shopee';

const CHUNK_SECONDS = 15 * 24 * 60 * 60; // 15-day max per Shopee API
const ESCROW_BATCH_SIZE = 50; // Shopee limit for get_escrow_detail_batch

export interface EscrowOrderIncome {
  escrow_amount?: number;
  buyer_total_amount?: number;
  commission_fee?: number;
  service_fee?: number;
  seller_transaction_fee?: number;
  voucher_from_seller?: number;
  actual_shipping_fee?: number;
  shopee_shipping_rebate?: number;
  ams_commission_fee?: number;
  original_cost_of_goods_sold?: number;
}

export interface EscrowBatchItem {
  order_sn: string;
  order_income: EscrowOrderIncome;
  release_time?: number;
}

/**
 * Fetch escrow details for many orders via /payment/get_escrow_detail_batch.
 * Splits into batches of 50 (Shopee limit), parallelised across batches.
 * Orders without an escrow_detail (e.g. unsettled) are silently dropped.
 */
export async function fetchEscrowBatch(orderSns: string[]): Promise<EscrowBatchItem[]> {
  if (!orderSns.length) return [];
  const batches: string[][] = [];
  for (let i = 0; i < orderSns.length; i += ESCROW_BATCH_SIZE) {
    batches.push(orderSns.slice(i, i + ESCROW_BATCH_SIZE));
  }

  const responses = await Promise.all(
    batches.map((batch) =>
      callShopee<{
        result_list: {
          order_sn: string;
          escrow_detail?: {
            order_income: EscrowOrderIncome;
            release_time?: number;
          };
        }[];
      }>('/api/v2/payment/get_escrow_detail_batch', {
        order_sn_list: batch.join(','),
      }).catch(() => ({ result_list: [] })),
    ),
  );

  const out: EscrowBatchItem[] = [];
  for (const r of responses) {
    for (const item of r.result_list ?? []) {
      if (!item.escrow_detail) continue;
      out.push({
        order_sn: item.order_sn,
        order_income: item.escrow_detail.order_income,
        release_time: item.escrow_detail.release_time,
      });
    }
  }
  return out;
}

export async function fetchOrderSummaries(
  from: number,
  to: number,
  cap = 500,
  timeRangeField: 'create_time' | 'update_time' = 'create_time',
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
      const data = await callShopee<{
        order_list: ShopeeOrderSummary[];
        more: boolean;
        next_cursor: string;
      }>('/api/v2/order/get_order_list', {
        time_range_field: timeRangeField,
        time_from: chunk.from,
        time_to: chunk.to,
        page_size: 100,
        response_optional_fields: 'order_status',
        ...(cursor ? { cursor } : {}),
      });
      allOrders.push(...(data.order_list ?? []));
      more = data.more ?? false;
      cursor = data.next_cursor ?? '';
    }
  }

  const capped = allOrders.length >= cap;
  return { orders: allOrders.slice(0, cap), capped };
}
