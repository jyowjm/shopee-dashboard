import { callTikTok } from '@/lib/tiktok';
import type { DbOrderRow, DbItemRow } from '@/lib/db-sync';
import type {
  TikTokOrderListItem,
  TikTokOrderDetail,
} from '@/types/tiktok';

// TikTok allows max 7-day windows per search request
const CHUNK_SECONDS = 7 * 24 * 60 * 60;
const BATCH_SIZE    = 50;

// TikTok order statuses mapped to the closest Shopee equivalent stored in DB
const STATUS_MAP: Record<string, string> = {
  UNPAID:             'UNPAID',
  ON_HOLD:            'UNPAID',
  AWAITING_SHIPMENT:  'READY_TO_SHIP',
  AWAITING_COLLECTION:'READY_TO_SHIP',
  IN_TRANSIT:         'SHIPPED',
  DELIVERED:          'COMPLETED',
  COMPLETED:          'COMPLETED',
  CANCELLED:          'CANCELLED',
  PARTIALLY_REFUNDED: 'TO_RETURN',
  SELLER_PART_SEND_GOODS: 'SHIPPED',
};

function mapStatus(tikTokStatus: string): string {
  return STATUS_MAP[tikTokStatus] ?? tikTokStatus;
}

function parsePrice(val: string | undefined | null): number | null {
  if (!val) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function toTs(unix: number | undefined | null): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

/**
 * Search TikTok orders by create_time range, walking in 7-day chunks.
 * Returns a flat list of order IDs + statuses.
 */
export async function fetchTikTokOrderList(
  from: number,
  to: number,
  cap = Infinity
): Promise<{ orders: TikTokOrderListItem[]; capped: boolean }> {
  const allOrders: TikTokOrderListItem[] = [];

  let start = from;
  while (start < to && allOrders.length < cap) {
    const end = Math.min(start + CHUNK_SECONDS, to);
    let cursor = '';
    let hasMore = true;

    while (hasMore && allOrders.length < cap) {
      // page_size and cursor are query params (signed), not body params
      const queryParams: Record<string, string> = {
        page_size: '100',
        ...(cursor ? { cursor } : {}),
      };

      const body: Record<string, unknown> = {
        create_time_ge: start,   // ≥ start (TikTok uses _ge/_lt, not _from/_to)
        create_time_lt: end,     // < end
      };

      const data = await callTikTok<{
        orders: TikTokOrderListItem[];
        next_cursor?: string;
        total_count?: number;
      }>(
        '/order/202309/orders/search',
        queryParams,
        { method: 'POST', body }
      );

      allOrders.push(...(data.orders ?? []));
      cursor  = data.next_cursor ?? '';
      hasMore = !!cursor;
    }

    start = end;
  }

  const capped = allOrders.length >= cap;
  return { orders: allOrders.slice(0, cap === Infinity ? allOrders.length : cap), capped };
}

/**
 * Fetch full TikTok order details in batches of 50.
 */
export async function fetchTikTokOrderDetails(orderIds: string[]): Promise<TikTokOrderDetail[]> {
  const results: TikTokOrderDetail[] = [];

  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const batch = orderIds.slice(i, i + BATCH_SIZE);
    const data = await callTikTok<{ orders: TikTokOrderDetail[] }>(
      '/order/202309/orders',
      { ids: batch.join(',') }
    );
    results.push(...(data.orders ?? []));
  }

  return results;
}

/**
 * Convert TikTok order details → DbOrderRow + DbItemRow (same shape used by Shopee sync).
 */
export function tikTokOrdersToRows(
  orders: TikTokOrderDetail[]
): { orderRows: DbOrderRow[]; itemRows: DbItemRow[] } {
  const orderRows: DbOrderRow[] = orders.map(o => {
    const addr = o.recipient_address;

    // Extract state from district_info array (address_type "STATE" or "PROVINCE")
    const stateEntry = addr?.district_info?.find(
      d => d.address_type === 'STATE' || d.address_type === 'PROVINCE'
    );
    const cityEntry = addr?.district_info?.find(d => d.address_type === 'CITY');
    const districtEntry = addr?.district_info?.find(d => d.address_type === 'DISTRICT');

    const totalAmount = parsePrice(o.payment?.total_amount);

    return {
      order_sn:          o.id,
      platform:          'tiktok',
      buyer_user_id:     null,                         // Shopee-only field
      tiktok_buyer_uid:  o.buyer_uid ?? null,
      order_status:      mapStatus(o.status),
      message_to_seller: o.buyer_message ?? null,
      create_time:       toTs(o.create_time)!,
      update_time:       toTs(o.update_time),
      total_amount:      totalAmount,
      payment_method:    o.payment_method_name ?? null,
      shipping_carrier:  o.shipping_carrier ?? null,
      tracking_number:   o.tracking_number ?? null,
      // Address — TikTok masked in production for some markets; best-effort
      recipient_name:    addr?.name ?? null,
      recipient_phone:   addr?.phone_number ?? null,
      recipient_state:   stateEntry?.address_level_name ?? null,
      recipient_city:    cityEntry?.address_level_name ?? null,
      recipient_district:districtEntry?.address_level_name ?? null,
      recipient_zipcode: addr?.postal_code ?? null,
      recipient_region:  addr?.region_code ?? null,
    };
  });

  const itemRows: DbItemRow[] = orders.flatMap(o =>
    (o.line_items ?? []).map(item => ({
      order_sn:                  o.id,
      item_id:                   parseInt(item.product_id, 10) || null,
      item_name:                 item.product_name ?? null,
      item_sku:                  item.seller_sku ?? null,
      model_id:                  parseInt(item.sku_id, 10) || null,
      model_name:                item.sku_name ?? null,
      model_sku:                 item.seller_sku ?? null,
      model_quantity_purchased:  item.quantity ?? 1,    // TikTok: each line_item = 1 unit (no quantity field)
      model_original_price:      parsePrice(item.original_price),
      model_discounted_price:    parsePrice(item.sale_price),
      image_url:                 item.sku_image ?? null, // TikTok uses sku_image, not image_url
    }))
  );

  return { orderRows, itemRows };
}
