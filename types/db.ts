// Row shapes for the Supabase orders + order_items tables.
// Used by both Shopee (lib/db-sync.ts apiOrderToRows) and TikTok (lib/tiktok-orders.ts
// tikTokOrdersToRows) ingestion paths, plus the XLSX upload parser.

export interface DbOrderRow {
  order_sn: string;
  platform?: 'shopee' | 'tiktok'; // defaults to 'shopee' in DB if omitted
  buyer_user_id?: number | null;
  tiktok_buyer_uid?: string | null; // TikTok-specific buyer identity
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
