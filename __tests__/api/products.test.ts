import { aggregateProducts } from '@/app/api/shopee/products/helpers';
import type { ShopeeOrderDetail } from '@/types/shopee';

const orders: ShopeeOrderDetail[] = [
  {
    order_sn: 'A1',
    order_status: 'COMPLETED',
    total_amount: 100,
    create_time: 1700000000,
    item_list: [
      { item_id: 1, item_name: 'Widget', model_quantity_purchased: 2, model_discounted_price: 50 },
    ],
  },
  {
    order_sn: 'A2',
    order_status: 'COMPLETED',
    total_amount: 50,
    create_time: 1700000000,
    item_list: [
      { item_id: 1, item_name: 'Widget', model_quantity_purchased: 1, model_discounted_price: 50 },
      { item_id: 2, item_name: 'Gadget', model_quantity_purchased: 3, model_discounted_price: 0 },
    ],
  },
];

describe('aggregateProducts()', () => {
  it('sums units_sold across orders for the same item', () => {
    const result = aggregateProducts(orders);
    const widget = result.find(p => p.item_id === 1);
    expect(widget?.units_sold).toBe(3);
  });

  it('sums revenue for each item', () => {
    const result = aggregateProducts(orders);
    const widget = result.find(p => p.item_id === 1);
    expect(widget?.revenue).toBe(150); // 2*50 + 1*50
  });

  it('returns results sorted by revenue descending', () => {
    const result = aggregateProducts(orders);
    expect(result[0].revenue).toBeGreaterThanOrEqual(result[1]?.revenue ?? 0);
  });

  it('returns at most 10 products', () => {
    const manyOrders: ShopeeOrderDetail[] = Array.from({ length: 20 }, (_, i) => ({
      order_sn: `X${i}`,
      order_status: 'COMPLETED',
      total_amount: 10,
      create_time: 1700000000,
      item_list: [{ item_id: i + 100, item_name: `Product ${i}`, model_quantity_purchased: 1, model_discounted_price: 10 }],
    }));
    expect(aggregateProducts(manyOrders)).toHaveLength(10);
  });
});
