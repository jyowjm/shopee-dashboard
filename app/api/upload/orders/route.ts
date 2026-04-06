import { NextRequest, NextResponse } from 'next/server';
import { parseOrderReport } from '@/lib/report-parser';
import { upsertOrderRows, replaceOrderItems } from '@/lib/db-sync';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Must upload a .xlsx file' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { orders, items } = parseOrderReport(buffer);

    if (!orders.length) {
      return NextResponse.json({ error: 'No orders found in report' }, { status: 400 });
    }

    await upsertOrderRows(orders, 'report');
    await replaceOrderItems(
      orders.map(o => o.order_sn),
      items
    );

    return NextResponse.json({ ok: true, orders: orders.length, items: items.length });
  } catch (err) {
    console.error('upload/orders error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
