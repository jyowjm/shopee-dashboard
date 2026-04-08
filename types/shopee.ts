export interface ShopeeTokens {
  access_token: string;
  refresh_token: string;
  shop_id: number;
  expires_at: number; // Unix milliseconds
}

export interface RevenueData {
  total_revenue: number;
  order_count: number;
  daily: { date: string; revenue: number }[];
  orders: { order_sn: string; date: string; status: string; amount: number }[];
  capped: boolean;
  prev_total_revenue: number;
  prev_order_count: number;
}

export interface OrdersData {
  total: number;
  by_status: Record<string, number>;
}

export interface ProductData {
  item_id: number;
  name: string;
  units_sold: number;
  revenue: number;
}

export interface ShopHealthData {
  shop_name: string;
  shop_logo: string;
  rating: number;
  cancellation_rate: number;
  response_rate: number;
  late_shipment_rate: number;
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
  // Legacy field kept for backward compatibility
  voucher_from_seller?: number;
}

export interface CustomerData {
  total_unique_customers: number;
  new_customers: number;
  existing_customers: number;
  repeat_purchase_rate: number;    // % of buyers with 2+ orders (0–100)
  avg_orders_per_customer: number;
  avg_spend_per_customer: number;  // in RM
  top_locations: { state: string; count: number }[];
  capped: boolean;
  location_coverage: { orders_with_state: number; total_paid_orders: number };
}

export interface FeesData {
  net_payout: number;       // sum of escrow_amount
  gross_revenue: number;    // sum of buyer_total_amount
  total_fees: number;       // commission + service + transaction fees
  fee_rate: number;         // total_fees / gross_revenue * 100
  breakdown: {
    commission_fee: number;
    service_fee: number;
    transaction_fee: number;  // seller_transaction_fee
  };
  capped: boolean;
  prev_net_payout: number;
  prev_total_fees: number;
}

export interface AdsData {
  total_spend: number;
  ad_revenue: number;  // broad_gmv sum (7-day attribution)
  roas: number;        // ad_revenue / total_spend, 0 if no spend
  clicks: number;
  impressions: number;
}

export type ShopeeApiError = {
  type: 'rate_limit' | 'auth' | 'api_error';
  message: string;
};
