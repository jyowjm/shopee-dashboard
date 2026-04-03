import { format } from 'date-fns';
import type { ShopeeOrderDetail, RevenueData } from '@/types/shopee';

export function aggregateRevenue(orders: ShopeeOrderDetail[]): RevenueData {
  const dailyMap = new Map<string, number>();

  for (const order of orders) {
    const date = format(new Date(order.create_time * 1000), 'yyyy-MM-dd');
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + order.total_amount);
  }

  const daily = Array.from(dailyMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const orderRows = orders
    .map(o => ({
      order_sn: o.order_sn,
      date: format(new Date(o.create_time * 1000), 'yyyy-MM-dd'),
      status: o.order_status,
      amount: o.total_amount,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    total_revenue: orders.reduce((sum, o) => sum + o.total_amount, 0),
    order_count: orders.length,
    daily,
    orders: orderRows,
    capped: false,
  };
}
