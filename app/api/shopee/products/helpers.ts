import type { ShopeeOrderDetail, ProductData } from '@/types/shopee';

export function aggregateProducts(orders: ShopeeOrderDetail[]): ProductData[] {
  const map = new Map<number, ProductData>();

  for (const order of orders) {
    for (const item of order.item_list) {
      const existing = map.get(item.item_id);
      const revenue = item.model_quantity_purchased * item.model_discounted_price;
      if (existing) {
        existing.units_sold += item.model_quantity_purchased;
        existing.revenue += revenue;
      } else {
        map.set(item.item_id, {
          item_id: item.item_id,
          name: item.item_name,
          units_sold: item.model_quantity_purchased,
          revenue,
        });
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}
