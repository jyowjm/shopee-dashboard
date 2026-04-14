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

// GET /order/202309/orders (or POST /order/202507/orders) — full order detail

export interface TikTokDistrictInfo {
  address_level_name: string;  // e.g. "Country", "State", "City"
  address_name?: string;
  address_type?: string;       // e.g. "STATE", "PROVINCE", "CITY", "DISTRICT"
  address_level?: string;      // e.g. "L0"
  iso_code?: string;
}

export interface TikTokRecipientAddress {
  full_address?: string;
  phone_number?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  first_name_local_script?: string;
  last_name_local_script?: string;
  region_code?: string;
  postal_code?: string;
  post_town?: string;
  address_line1?: string;
  address_line2?: string;
  address_line3?: string;
  address_line4?: string;
  address_detail?: string;
  district_info?: TikTokDistrictInfo[];
  delivery_preferences?: {
    drop_off_location?: string;
  };
}

export interface TikTokItemTax {
  tax_type: string;       // e.g. "SALES_TAX"
  tax_amount: string;     // decimal string
  tax_rate: string;       // decimal string
}

export interface TikTokOrderLineItem {
  id: string;
  product_id: string;
  product_name: string;
  sku_id?: string;
  sku_name?: string;
  sku_image?: string;          // NOTE: actual field is sku_image, NOT image_url
  seller_sku?: string;
  // NOTE: TikTok does NOT return a `quantity` field in line_items.
  // Each line_item represents exactly 1 unit ordered.
  quantity?: never;
  sale_price?: string;         // decimal string e.g. "29.90"; price after seller discount
  original_price?: string;     // decimal string; listing price before discounts
  seller_discount?: string;    // decimal string
  platform_discount?: string;  // decimal string
  currency?: string;
  display_status?: string;
  package_status?: string;
  package_id?: string;
  item_tax?: TikTokItemTax[];
  rts_time?: number;
  cancel_reason?: string;
  cancel_user?: string;
  is_gift?: boolean;
  shipping_provider_id?: string;
  shipping_provider_name?: string;
  tracking_number?: string;
}

export interface TikTokOrderDetail {
  id: string;                         // order_id
  status: string;                     // e.g. "COMPLETED", "CANCELLED"
  create_time: number;
  update_time: number;
  // buyer identity — field name may differ by API version:
  // 202309 uses buyer_uid; 202507 uses user_id
  buyer_uid?: string;
  user_id?: string;
  buyer_message?: string;
  payment_method_name?: string;
  payment_method_code?: string;
  shipping_carrier?: string;
  shipping_type?: string;
  tracking_number?: string;
  fulfillment_type?: string;
  delivery_type?: string;
  recipient_address?: TikTokRecipientAddress;
  line_items?: TikTokOrderLineItem[];
  packages?: Array<{ id: string }>;
  payment?: {
    currency?: string;
    sub_total: string;                          // item subtotal (before shipping)
    shipping_fee?: string;                      // net shipping paid by buyer
    seller_discount?: string;                   // seller-funded discount
    platform_discount?: string;                 // platform-funded discount (not seller's loss)
    total_amount: string;                       // buyer's final payment
    original_total_product_price?: string;      // MSRP before any discounts
    original_shipping_fee?: string;
    shipping_fee_seller_discount?: string;
    shipping_fee_platform_discount?: string;
    shipping_fee_cofunded_discount?: string;
    tax?: string;                               // total tax
    product_tax?: string;                       // product-specific tax
    shipping_fee_tax?: string;
    small_order_fee?: string;
    buyer_service_fee?: string;
    handling_fee?: string;
    shipping_insurance_fee?: string;
    item_insurance_fee?: string;
    item_insurance_tax?: string;
    retail_delivery_fee?: string;
    distance_shipping_fee?: string;
    distance_fee?: string;
    payment_platform_discount?: string;
    payment_discount_service_fee?: string;
  };
  // Order metadata
  paid_time?: number;
  rts_time?: number;
  rts_sla_time?: number;
  cancel_time?: number;
  cancel_reason?: string;
  cancellation_initiator?: string;
  seller_note?: string;
  buyer_email?: string;
  buyer_nickname?: string;
  is_cod?: boolean;
  is_sample_order?: boolean;
  is_replacement_order?: boolean;
  warehouse_id?: string;
  order_type?: string;
  commerce_platform?: string;
  fulfillment_priority_level?: number;
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

/** One daily statement record from GET /finance/202309/statements */
export interface TikTokStatement {
  id:                   string;
  statement_time:       number;  // Unix timestamp
  settlement_amount:    string;  // net payout to seller (decimal string)
  currency:             string;
  revenue_amount:       string;  // item revenue (decimal string)
  fee_amount:           string;  // platform fees (decimal string, may be negative)
  adjustment_amount:    string;
  payment_status:       string;  // e.g. "PAID", "PROCESSING", "FAILED"
  payment_id:           string;
  net_sales_amount:     string;
  shipping_cost_amount: string;
  payment_time:         number;  // Unix timestamp
}

/**
 * One order-level transaction from
 * GET /finance/202501/statements/{id}/statement_transactions
 * Field names mirror TikTokOrderStatement (same endpoint family).
 */
export interface TikTokStatementTransaction {
  order_id?: string;
  revenue_amount: string;       // positive; item revenue
  fee_and_tax_amount: string;   // negative; platform fees + taxes
  settlement_amount: string;    // net payout to seller
  [key: string]: unknown;
}

/**
 * SKU-level fee and tax breakdown from
 * GET /finance/202501/orders/{order_id}/statement_transactions
 */
export interface TikTokFeeTaxBreakdown {
  fee: {
    referral_fee_amount:                    string;  // main platform commission
    transaction_fee_amount:                 string;  // payment processing
    affiliate_commission_amount_before_pit: string;  // creator/affiliate commission
    affiliate_partner_commission_amount:    string;
    affiliate_ads_commission_amount:        string;
    sfp_service_fee_amount:                 string;
    voucher_xtra_service_fee_amount:        string;
    flash_sales_service_fee_amount:         string;
    cofunded_promotion_service_fee_amount:  string;
    live_specials_fee_amount:               string;
    pre_order_service_fee_amount:           string;
    [key: string]: string;
  };
  tax: {
    sst_amount:   string;   // Malaysia SST
    vat_amount:   string;
    gst_amount:   string;
    [key: string]: string;
  };
}

export interface TikTokSkuTransaction {
  sku_id:             string;
  fee_tax_amount:     string;
  fee_tax_breakdown?: TikTokFeeTaxBreakdown;
  [key: string]: unknown;
}

/** Response from GET /finance/202501/orders/{order_id}/statement_transactions */
export interface TikTokOrderTransaction {
  order_id:             string;
  revenue_amount:       string;
  settlement_amount:    string;
  fee_and_tax_amount:   string;
  shipping_cost_amount: string;
  sku_transactions:     TikTokSkuTransaction[];
}

/**
 * One record from GET /finance/202507/orders/unsettled
 * fee_tax_breakdown is at the transaction level (not inside sku_transactions).
 * Affiliate field name differs from settled: `affiliate_commission_before_pit_amount`
 * (settled uses `affiliate_commission_amount_before_pit`).
 */
export interface TikTokUnsettledTransaction {
  type:                     string;  // 'ORDER' | 'ADJUSTMENT'
  id:                       string;
  status:                   string;
  currency:                 string;
  order_id:                 string;
  order_create_time:        number;
  est_settlement_amount:    string;  // estimated net payout
  est_revenue_amount:       string;  // estimated item revenue
  est_shipping_cost_amount: string;  // estimated shipping subsidy (negative)
  est_fee_tax_amount:       string;  // estimated fee + tax total (negative)
  fee_tax_breakdown?: {
    fee: {
      referral_fee_amount:                    string;
      transaction_fee_amount:                 string;
      affiliate_commission_before_pit_amount: string;  // different from settled!
      sfp_service_fee_amount:                 string;
      voucher_xtra_service_fee_amount:        string;
      flash_sales_service_fee_amount:         string;
      cofunded_promotion_service_fee_amount:  string;
      live_specials_fee_amount:               string;
      pre_order_service_fee_amount:           string;
      [key: string]: string;
    };
    tax: {
      sst_amount:  string;
      vat_amount:  string;
      gst_amount:  string;
      [key: string]: string;
    };
  };
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
