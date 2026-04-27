import { toMytDate } from '@/lib/datetime';
import type { ShopeeOrderDetail } from '@/types/shopee';
import type { RevenueData } from '@/types/dashboard';

function itemRevenue(order: ShopeeOrderDetail): number {
  const itemsTotal = (order.item_list ?? []).reduce(
    (sum, item) => sum + (item.model_discounted_price ?? 0) * (item.model_quantity_purchased ?? 0),
    0,
  );
  return itemsTotal - (order.voucher_from_seller ?? 0);
}

export function aggregateRevenue(orders: ShopeeOrderDetail[]): RevenueData {
  const dailyMap = new Map<string, number>();

  for (const order of orders) {
    const date = toMytDate(order.create_time);
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + itemRevenue(order));
  }

  const daily = Array.from(dailyMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const orderRows = orders
    .map((o) => ({
      order_sn: o.order_sn,
      date: toMytDate(o.create_time),
      status: o.order_status,
      amount: itemRevenue(o),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    total_revenue: orders.reduce((sum, o) => sum + itemRevenue(o), 0),
    order_count: orders.length,
    daily,
    orders: orderRows,
    capped: false,
    prev_total_revenue: 0,
    prev_order_count: 0,
  };
}
