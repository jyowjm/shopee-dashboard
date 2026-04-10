import { callShopee } from '@/lib/shopee';
import { getSupabase } from '@/lib/supabase';
import type { ShopeeOrderDetail } from '@/types/shopee';

const BATCH_SIZE = 50;
const UPSERT_CHUNK = 100;

export const FULL_OPTIONAL_FIELDS = [
  'buyer_user_id',
  'buyer_username',
  'recipient_address',
  'total_amount',
  'pay_time',
  'payment_method',
  'shipping_carrier',
  'fulfillment_flag',
  'cancel_reason',
  'cancel_by',
  'buyer_cancel_reason',
  'estimated_shipping_fee',
  'actual_shipping_fee',
  'actual_shipping_fee_confirmed',
  'item_list',
].join(',');

export function isPaidOrder(status: string): boolean {
  return !['CANCELLED', 'IN_CANCEL', 'UNPAID'].includes(status);
}

// Common DB row shape for the orders table
export interface DbOrderRow {
  order_sn: string;
  platform?: 'shopee' | 'tiktok';    // defaults to 'shopee' in DB if omitted
  buyer_user_id?: number | null;
  tiktok_buyer_uid?: string | null;   // TikTok-specific buyer identity
  region?: string | null;
  currency?: string | null;
  cod?: boolean | null;
  order_status: string;
  message_to_seller?: string | null;
  create_time: string; // ISO timestamp
  update_time?: string | null;
  days_to_ship?: number | null;
  ship_by_date?: string | null;
  buyer_username?: string | null;
  total_amount?: number | null;
  pay_time?: string | null;
  payment_method?: string | null;
  shipping_carrier?: string | null;
  fulfillment_flag?: string | null;
  cancel_reason?: string | null;
  cancel_by?: string | null;
  buyer_cancel_reason?: string | null;
  estimated_shipping_fee?: number | null;
  actual_shipping_fee?: number | null;
  actual_shipping_fee_confirmed?: boolean | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  recipient_town?: string | null;
  recipient_district?: string | null;
  recipient_city?: string | null;
  recipient_state?: string | null;
  recipient_region?: string | null;
  recipient_zipcode?: string | null;
  tracking_number?: string | null;
  ship_time?: string | null;
  order_complete_time?: string | null;
  return_refund_status?: string | null;
  shipment_method?: string | null;
}

// Common DB row shape for the order_items table
export interface DbItemRow {
  order_sn: string;
  item_id?: number | null;
  item_name?: string | null;
  item_sku?: string | null;
  model_id?: number | null;
  model_name?: string | null;
  model_sku?: string | null;
  model_quantity_purchased?: number | null;
  model_original_price?: number | null;
  model_discounted_price?: number | null;
  promotion_type?: string | null;
  image_url?: string | null;
  returned_quantity?: number | null;
  total_buyer_payment?: number | null;
  voucher_code?: string | null;
}

function toTs(unix: number | undefined | null): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

// Convert Shopee-masked values (e.g. "****", "***57") to null
function unmasked(val: string | undefined | null): string | null {
  if (!val?.trim()) return null;
  if (/^\*+$/.test(val.trim())) return null; // fully masked
  return val.trim();
}

const ADDRESS_FIELDS = [
  'recipient_name', 'recipient_phone', 'recipient_town', 'recipient_district',
  'recipient_city', 'recipient_state', 'recipient_region', 'recipient_zipcode',
] as const;

export function apiOrderToRows(
  orders: ShopeeOrderDetail[]
): { orderRows: DbOrderRow[]; itemRows: DbItemRow[] } {
  const orderRows: DbOrderRow[] = orders.map(o => ({
    order_sn: o.order_sn,
    buyer_user_id: o.buyer_user_id && o.buyer_user_id !== 0 ? o.buyer_user_id : null,
    region: o.region ?? null,
    currency: o.currency ?? null,
    cod: o.cod ?? null,
    order_status: o.order_status,
    message_to_seller: o.message_to_seller ?? null,
    create_time: toTs(o.create_time)!,
    update_time: toTs(o.update_time),
    days_to_ship: o.days_to_ship ?? null,
    ship_by_date: toTs(o.ship_by_date),
    buyer_username: o.buyer_username ?? null,
    total_amount: o.total_amount ?? null,
    pay_time: toTs(o.pay_time),
    payment_method: o.payment_method ?? null,
    shipping_carrier: o.shipping_carrier ?? null,
    fulfillment_flag: o.fulfillment_flag ?? null,
    cancel_reason: o.cancel_reason ?? null,
    cancel_by: o.cancel_by ?? null,
    buyer_cancel_reason: o.buyer_cancel_reason ?? null,
    estimated_shipping_fee: o.estimated_shipping_fee ?? null,
    actual_shipping_fee: o.actual_shipping_fee ?? null,
    actual_shipping_fee_confirmed: o.actual_shipping_fee_confirmed ?? null,
    recipient_name: unmasked(o.recipient_address?.name),
    recipient_phone: unmasked(o.recipient_address?.phone),
    recipient_town: unmasked(o.recipient_address?.town),
    recipient_district: unmasked(o.recipient_address?.district),
    recipient_city: unmasked(o.recipient_address?.city),
    recipient_state: unmasked(o.recipient_address?.state),
    recipient_region: unmasked(o.recipient_address?.region),
    recipient_zipcode: unmasked(o.recipient_address?.zipcode),
  }));

  const itemRows: DbItemRow[] = orders.flatMap(o =>
    (o.item_list ?? []).map(item => ({
      order_sn: o.order_sn,
      item_id: item.item_id ?? null,
      item_name: item.item_name ?? null,
      item_sku: item.item_sku ?? null,
      model_id: item.model_id ?? null,
      model_name: item.model_name ?? null,
      model_sku: item.model_sku ?? null,
      model_quantity_purchased: item.model_quantity_purchased ?? null,
      model_original_price: item.model_original_price ?? null,
      model_discounted_price: item.model_discounted_price ?? null,
      promotion_type: item.promotion_type ?? null,
      image_url: item.image_info?.image_url ?? null,
    }))
  );

  return { orderRows, itemRows };
}

export async function fetchOrderDetails(sns: string[]): Promise<ShopeeOrderDetail[]> {
  const batches: string[][] = [];
  for (let i = 0; i < sns.length; i += BATCH_SIZE) {
    batches.push(sns.slice(i, i + BATCH_SIZE));
  }
  const results = await Promise.allSettled(
    batches.map(batch =>
      callShopee<{ order_list: ShopeeOrderDetail[] }>('/api/v2/order/get_order_detail', {
        order_sn_list: batch.join(','),
        response_optional_fields: FULL_OPTIONAL_FIELDS,
      })
    )
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{ order_list: ShopeeOrderDetail[] }> => r.status === 'fulfilled')
    .flatMap(r => r.value.order_list ?? []);
}

async function _upsertOrderRows(rows: DbOrderRow[], source: 'api' | 'report'): Promise<void> {
  const supabase = getSupabase();
  const enriched = rows.map(r => ({
    ...r,
    is_paid_order: isPaidOrder(r.order_status),
    data_source: source,
    synced_at: new Date().toISOString(),
  }));

  // Ensure buyer records exist before inserting orders (FK constraint).
  // Creates placeholder rows; upsertBuyers() fills in aggregates later.
  const buyerIds = [...new Set(
    enriched.map(r => r.buyer_user_id).filter((id): id is number => !!id && id !== 0)
  )];
  if (buyerIds.length) {
    const { error: bErr } = await supabase
      .from('buyers')
      .upsert(buyerIds.map(id => ({ buyer_user_id: id })), { onConflict: 'buyer_user_id', ignoreDuplicates: true });
    if (bErr) throw new Error(`upsertOrders (buyer placeholders): ${bErr.message}`);
  }

  for (let i = 0; i < enriched.length; i += UPSERT_CHUNK) {
    let chunk = enriched.slice(i, i + UPSERT_CHUNK);
    const chunkSns = chunk.map(r => r.order_sn);

    // Preserve fields that each source cannot provide:
    // - API source: keep address fields populated by report uploads (API masks them)
    // - Report source: keep buyer_user_id set by API sync (reports don't have it)
    const preserveFields: string[] = source === 'api'
      ? [...ADDRESS_FIELDS]
      : ['buyer_user_id'];

    const { data: existing } = await supabase
      .from('orders')
      .select(`order_sn, ${preserveFields.join(', ')}`)
      .in('order_sn', chunkSns);
    if (existing?.length) {
      const existingMap = new Map((existing as unknown as Record<string, unknown>[]).map(r => [r.order_sn as string, r]));
      chunk = chunk.map(row => {
        const ex = existingMap.get(row.order_sn);
        if (!ex) return row;
        const merged = { ...row };
        for (const field of preserveFields) {
          if ((merged as Record<string, unknown>)[field] == null && ex[field] != null) {
            (merged as Record<string, unknown>)[field] = ex[field];
          }
        }
        return merged;
      });
    }

    const { error } = await supabase
      .from('orders')
      .upsert(chunk, { onConflict: 'order_sn', ignoreDuplicates: false });
    if (error) throw new Error(`upsertOrders: ${error.message}`);

    // If a row already existed from the other source, mark data_source='both'
    await supabase
      .from('orders')
      .update({ data_source: 'both' })
      .in('order_sn', chunkSns)
      .neq('data_source', source)
      .neq('data_source', 'both');
  }
}

export async function upsertOrders(
  orders: ShopeeOrderDetail[],
  source: 'api' | 'report' = 'api'
): Promise<void> {
  const { orderRows } = apiOrderToRows(orders);
  await _upsertOrderRows(orderRows, source);
}

export async function upsertOrderRows(
  rows: DbOrderRow[],
  source: 'api' | 'report'
): Promise<void> {
  await _upsertOrderRows(rows, source);
}

export async function replaceOrderItems(
  sns: string[],
  items: DbItemRow[]
): Promise<void> {
  const supabase = getSupabase();
  if (!sns.length) return;

  // Delete in chunks to avoid URL length limits on large SN lists
  for (let i = 0; i < sns.length; i += UPSERT_CHUNK) {
    const { error: delErr } = await supabase
      .from('order_items')
      .delete()
      .in('order_sn', sns.slice(i, i + UPSERT_CHUNK));
    if (delErr) throw new Error(`replaceOrderItems delete: ${delErr.message}`);
  }

  if (!items.length) return;

  for (let i = 0; i < items.length; i += UPSERT_CHUNK) {
    const { error } = await supabase.from('order_items').insert(items.slice(i, i + UPSERT_CHUNK));
    if (error) throw new Error(`replaceOrderItems insert: ${error.message}`);
  }
}

export async function upsertBuyers(buyerIds: number[]): Promise<void> {
  const ids = buyerIds.filter(id => id && id !== 0);
  if (!ids.length) return;
  const { error } = await getSupabase().rpc('upsert_buyers', { buyer_ids: ids });
  if (error) throw new Error(`upsertBuyers: ${error.message}`);
}

export async function getSyncState(key: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('sync_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return data?.value ?? null;
}

export async function setSyncState(key: string, value: string): Promise<void> {
  const { error } = await getSupabase()
    .from('sync_state')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`setSyncState: ${error.message}`);
}
