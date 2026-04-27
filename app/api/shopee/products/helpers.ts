import type { ShopeeOrderDetail } from '@/types/shopee';
import type { ProductData } from '@/types/dashboard';

export function aggregateProducts(orders: ShopeeOrderDetail[]): ProductData[] {
  const map = new Map<number, ProductData>();

  for (const order of orders) {
    for (const item of order.item_list ?? []) {
      if (!item.item_id) continue;
      const qty = item.model_quantity_purchased ?? 0;
      const price = item.model_discounted_price ?? 0;
      const revenue = qty * price;
      const existing = map.get(item.item_id);
      if (existing) {
        existing.units_sold += qty;
        existing.revenue += revenue;
      } else {
        map.set(item.item_id, {
          item_id: item.item_id,
          name: item.item_name ?? '',
          units_sold: qty,
          revenue,
        });
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}
