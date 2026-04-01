import type { ShopeeOrderSummary, OrdersData } from '@/types/shopee';

export function aggregateOrders(orders: ShopeeOrderSummary[]): OrdersData {
  const by_status: Record<string, number> = {};
  for (const order of orders) {
    by_status[order.order_status] = (by_status[order.order_status] ?? 0) + 1;
  }
  return { total: orders.length, by_status };
}
