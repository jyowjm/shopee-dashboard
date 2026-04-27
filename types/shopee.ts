// Shopee-specific types. Shared dashboard types (RevenueData, OrdersData,
// ProductData, CustomerData, FeesData, AdsData, ApiError) live in
// types/dashboard.ts — both Shopee and TikTok routes consume those.

export interface ShopeeTokens {
  access_token: string;
  refresh_token: string;
  shop_id: number;
  expires_at: number; // Unix milliseconds
}

export interface ShopeeOrderSummary {
  order_sn: string;
  order_status: string;
}

export interface ShopeeRecipientAddress {
  name?: string;
  phone?: string;
  town?: string;
  district?: string;
  city?: string;
  state?: string;
  region?: string;
  zipcode?: string;
  full_address?: string;
}

export interface ShopeeOrderItem {
  item_id?: number;
  item_name?: string;
  item_sku?: string;
  model_id?: number;
  model_name?: string;
  model_sku?: string;
  model_quantity_purchased?: number;
  model_original_price?: number;
  model_discounted_price?: number;
  promotion_type?: string;
  image_info?: { image_url?: string };
}

export interface ShopeeOrderDetail {
  order_sn: string;
  order_status: string;
  create_time: number; // Unix seconds
  // Default fields
  region?: string;
  currency?: string;
  cod?: boolean;
  message_to_seller?: string;
  update_time?: number;
  days_to_ship?: number;
  ship_by_date?: number;
  // Optional fields
  buyer_user_id?: number;
  buyer_username?: string;
  total_amount?: number;
  pay_time?: number;
  payment_method?: string;
  shipping_carrier?: string;
  fulfillment_flag?: string;
  cancel_reason?: string;
  cancel_by?: string;
  buyer_cancel_reason?: string;
  estimated_shipping_fee?: number;
  actual_shipping_fee?: number;
  actual_shipping_fee_confirmed?: boolean;
  recipient_address?: ShopeeRecipientAddress;
  item_list?: ShopeeOrderItem[];
  // Joined onto detail records by the revenue route after a separate
  // get_escrow_detail_batch lookup — not returned by get_order_detail itself.
  voucher_from_seller?: number;
}
