import { aggregateOrders } from '@/app/api/shopee/orders/helpers';
import type { ShopeeOrderSummary } from '@/types/shopee';

const orders: ShopeeOrderSummary[] = [
  { order_sn: 'A1', order_status: 'COMPLETED' },
  { order_sn: 'A2', order_status: 'COMPLETED' },
  { order_sn: 'A3', order_status: 'SHIPPED' },
  { order_sn: 'A4', order_status: 'CANCELLED' },
];

describe('aggregateOrders()', () => {
  it('returns the correct total', () => {
    expect(aggregateOrders(orders).total).toBe(4);
  });

  it('groups orders by status', () => {
    const result = aggregateOrders(orders);
    expect(result.by_status['COMPLETED']).toBe(2);
    expect(result.by_status['SHIPPED']).toBe(1);
    expect(result.by_status['CANCELLED']).toBe(1);
  });
});
