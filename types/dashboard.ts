// Platform-agnostic types used across the dashboard.
// Both the Shopee and TikTok routes return data in these shapes; merge helpers
// in components/*Section.tsx combine them when "All Platforms" is selected.

export type Platform = 'all' | 'shopee' | 'tiktok';

export interface RevenueData {
  total_revenue: number;
  order_count: number;
  daily: { date: string; revenue: number; shipping_revenue?: number }[];
  orders: {
    order_sn: string;
    date: string;
    status: string;
    amount: number;
    shipping_amount?: number;
  }[];
  capped: boolean;
  prev_total_revenue: number;
  prev_order_count: number;
  // TikTok-only — undefined for Shopee
  total_shipping_revenue?: number;
  prev_total_shipping_revenue?: number;
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

export interface CustomerData {
  total_unique_customers: number;
  new_customers: number;
  existing_customers: number;
  repeat_purchase_rate: number; // % of buyers with 2+ orders (0–100)
  avg_orders_per_customer: number;
  avg_spend_per_customer: number; // in RM
  top_locations: { state: string; count: number }[];
  capped: boolean;
  location_coverage: { orders_with_state: number; total_paid_orders: number };
}

export interface FeesData {
  net_payout: number; // sum of escrow_amount
  gross_revenue: number; // sum of buyer_total_amount
  total_fees: number; // commission + service + transaction fees
  fee_rate: number; // total_fees / gross_revenue * 100
  breakdown: {
    // Both platforms
    commission_fee: number; // Shopee: commission_fee; TikTok: referral_fee_amount
    service_fee: number; // Shopee: service_fee; TikTok: sum of voucher/flash/promo fees
    transaction_fee: number; // Shopee: transaction_fee; TikTok: transaction_fee_amount
    // TikTok-only (0 for Shopee)
    affiliate_fee: number; // affiliate_commission_amount_before_pit
    tax_amount: number; // sst_amount + vat_amount + gst_amount
    shipping_fee: number; // abs(shipping_cost_amount)
    adjustment: number; // adjustment_amount (net; may be negative)
  };
  capped: boolean;
  prev_net_payout: number;
  prev_total_fees: number;
  // TikTok-only — undefined for Shopee
  has_estimates?: boolean;
  unsettled_count?: number;
}

export interface AdsData {
  total_spend: number;
  ad_revenue: number; // broad_gmv sum (7-day attribution)
  roas: number; // ad_revenue / total_spend, 0 if no spend
  clicks: number;
  impressions: number;
}

// Errors thrown by both Shopee (lib/shopee.ts) and TikTok (lib/tiktok.ts) clients.
export interface ApiError {
  type: 'rate_limit' | 'auth' | 'api_error';
  message: string;
}
