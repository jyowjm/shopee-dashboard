import { aggregateRevenue } from '@/app/api/shopee/revenue/helpers';
import type { ShopeeOrderDetail } from '@/types/shopee';

const orders: ShopeeOrderDetail[] = [
  {
    order_sn: 'A1',
    order_status: 'COMPLETED',
    total_amount: 100,
    create_time: 1700000000, // 2023-11-14
    item_list: [
      { item_id: 1, item_name: 'Widget', model_quantity_purchased: 2, model_discounted_price: 50 },
    ],
  },
  {
    order_sn: 'A2',
    order_status: 'COMPLETED',
    total_amount: 50,
    create_time: 1700000000, // same day
    item_list: [
      { item_id: 2, item_name: 'Gadget', model_quantity_purchased: 1, model_discounted_price: 50 },
    ],
  },
  {
    order_sn: 'A3',
    order_status: 'COMPLETED',
    total_amount: 75,
    create_time: 1700086400, // 2023-11-15
    item_list: [
      { item_id: 1, item_name: 'Widget', model_quantity_purchased: 1, model_discounted_price: 75 },
    ],
  },
];

describe('aggregateRevenue()', () => {
  it('sums total revenue across all orders', () => {
    const result = aggregateRevenue(orders);
    expect(result.total_revenue).toBe(225);
  });

  it('counts the number of orders', () => {
    const result = aggregateRevenue(orders);
    expect(result.order_count).toBe(3);
  });

  it('groups revenue by date', () => {
    const result = aggregateRevenue(orders);
    expect(result.daily).toHaveLength(2);
    const day1 = result.daily.find((d) => d.revenue === 150);
    const day2 = result.daily.find((d) => d.revenue === 75);
    expect(day1).toBeDefined();
    expect(day2).toBeDefined();
  });

  it('sorts daily entries by date ascending', () => {
    const result = aggregateRevenue(orders);
    expect(new Date(result.daily[0].date) < new Date(result.daily[1].date)).toBe(true);
  });
});
