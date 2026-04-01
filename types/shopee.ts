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
  capped: boolean;
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

export interface ShopeeOrderDetail {
  order_sn: string;
  order_status: string;
  total_amount: number;
  create_time: number; // Unix seconds
  item_list: {
    item_id: number;
    item_name: string;
    model_quantity_purchased: number;
    model_discounted_price: number;
  }[];
}

export type ShopeeApiError = {
  type: 'rate_limit' | 'auth' | 'api_error';
  message: string;
};
