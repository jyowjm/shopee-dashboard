export interface TikTokTokens {
  access_token: string;
  refresh_token: string;
  shop_id: string;
  shop_cipher: string;
  expires_at: number; // Unix milliseconds
}

export interface TikTokApiError {
  type: 'rate_limit' | 'auth' | 'api_error';
  message: string;
}

// POST /order/202309/orders/search response
export interface TikTokOrderListItem {
  id: string;
  status: string;
  create_time: number; // Unix seconds
  update_time: number;
}

// GET /order/202309/orders — full order detail
export interface TikTokRecipientAddress {
  full_address?: string;
  district_info?: Array<{
    address_level_name: string;
    address_type: string;
  }>;
  name?: string;
  phone_number?: string;
  postal_code?: string;
  region_code?: string;
}

export interface TikTokOrderLineItem {
  id: string;
  product_id: string;
  product_name: string;
  sku_id: string;
  sku_name?: string;
  seller_sku?: string;
  quantity: number;
  sale_price: string;       // decimal string, e.g. "29.90"
  original_price?: string;
  image_url?: string;
}

export interface TikTokOrderDetail {
  id: string;                         // order_id
  status: string;                     // e.g. "COMPLETED", "CANCELLED"
  create_time: number;
  update_time: number;
  buyer_uid?: string;                 // TikTok buyer UID (string)
  buyer_message?: string;
  payment_method_name?: string;
  shipping_carrier?: string;
  tracking_number?: string;
  recipient_address?: TikTokRecipientAddress;
  line_items?: TikTokOrderLineItem[];
  payment?: {
    sub_total: string;                // item subtotal
    shipping_fee: string;
    platform_discount: string;
    seller_discount: string;
    total_amount: string;             // buyer's final payment
    original_total_product_price: string;
  };
}

// POST /finance/202309/payments/search
export interface TikTokSettlementRecord {
  order_id: string;
  settlement_amount: string;          // net payout (decimal string)
  subtotal: string;
  platform_discount: string;
  seller_discount: string;
  shipping_fee: string;
  commission_fee?: string;
  transaction_fee?: string;
  affiliate_commission?: string;
}

/**
 * Response from GET /finance/202501/orders/{order_id}/statement_transactions
 * Available for all regions (including SEA). Only settled orders have records.
 */
export interface TikTokOrderStatement {
  order_id: string;
  order_create_time: number;
  currency: string;
  revenue_amount: string;         // item revenue (positive)
  fee_and_tax_amount: string;     // platform fees + taxes (negative value)
  shipping_cost_amount: string;   // shipping subsidy to seller (negative value)
  settlement_amount: string;      // net payout to seller
}

export interface TikTokProductSearchItem {
  id: string;
  title: string;
  skus?: Array<{
    id: string;
    seller_sku?: string;
    price?: { original_price: string; sale_price: string };
  }>;
}
