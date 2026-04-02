import { NextResponse } from 'next/server';
import { callShopee } from '@/lib/shopee';
import type { ShopeeApiError } from '@/types/shopee';

export async function GET() {
  try {
    const shopInfo = await callShopee<{
      shop_name: string;
      shop_logo: string;
      rating_star: number;
    }>('/api/v2/shop/get_shop_info', {});

    let performance: { overall_performance?: { cancellation_rate?: { rate: number }; response_rate?: { rate: number }; late_shipment_rate?: { rate: number } } } = {};
    try {
      performance = await callShopee('/api/v2/shop/get_shop_performance', {});
    } catch {
      // performance data unavailable (e.g. sandbox)
    }

    return NextResponse.json({
      shop_name: shopInfo.shop_name,
      shop_logo: shopInfo.shop_logo,
      rating: shopInfo.rating_star,
      cancellation_rate: performance.overall_performance?.cancellation_rate?.rate ?? 0,
      response_rate: performance.overall_performance?.response_rate?.rate ?? 0,
      late_shipment_rate: performance.overall_performance?.late_shipment_rate?.rate ?? 0,
    });
  } catch (err) {
    const e = err as ShopeeApiError;
    if (e.type === 'auth') return NextResponse.json({ error: e.message }, { status: 401 });
    if (e.type === 'rate_limit') return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
