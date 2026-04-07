import { NextRequest, NextResponse } from 'next/server';
import { parseOrderReport } from '@/lib/report-parser';
import { upsertOrderRows, replaceOrderItems } from '@/lib/db-sync';
import type { DbOrderRow, DbItemRow } from '@/lib/db-sync';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll('file') as File[];

    if (!files.length) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const nonXlsx = files.find(f => !f.name.endsWith('.xlsx'));
    if (nonXlsx) {
      return NextResponse.json({ error: `${nonXlsx.name} is not a .xlsx file` }, { status: 400 });
    }

    // Parse all files and merge results
    const allOrders: DbOrderRow[] = [];
    const allItems: DbItemRow[] = [];
    const seenSns = new Set<string>();

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { orders, items } = parseOrderReport(buffer);
      for (const order of orders) {
        if (!seenSns.has(order.order_sn)) {
          seenSns.add(order.order_sn);
          allOrders.push(order);
        }
      }
      allItems.push(...items.filter(i => seenSns.has(i.order_sn)));
    }

    if (!allOrders.length) {
      return NextResponse.json({ error: 'No orders found in uploaded reports' }, { status: 400 });
    }

    await upsertOrderRows(allOrders, 'report');
    await replaceOrderItems(allOrders.map(o => o.order_sn), allItems);

    return NextResponse.json({ ok: true, orders: allOrders.length, items: allItems.length, files: files.length });
  } catch (err) {
    console.error('upload/orders error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
