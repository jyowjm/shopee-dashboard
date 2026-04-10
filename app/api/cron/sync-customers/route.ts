import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderSummaries } from '@/lib/orders';
import {
  fetchOrderDetails,
  apiOrderToRows,
  upsertOrderRows,
  replaceOrderItems,
  upsertBuyers,
  getSyncState,
  setSyncState,
} from '@/lib/db-sync';
import { loadTikTokTokens } from '@/lib/kv';
import { fetchTikTokOrderList, fetchTikTokOrderDetails, tikTokOrdersToRows } from '@/lib/tiktok-orders';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CHUNK_SECONDS = 15 * 24 * 60 * 60;
const UPDATE_WINDOW = 30 * 24 * 60 * 60;

async function fetchAllSns(
  from: number,
  to: number,
  timeRangeField: 'create_time' | 'update_time'
): Promise<string[]> {
  const { orders } = await fetchOrderSummaries(from, to, Infinity, timeRangeField);
  return orders.map(o => o.order_sn);
}

async function syncOrders(sns: string[]): Promise<void> {
  if (!sns.length) return;
  const details = await fetchOrderDetails(sns);
  const { orderRows, itemRows } = apiOrderToRows(details);
  await upsertOrderRows(orderRows, 'api');
  await replaceOrderItems(
    details.map(d => d.order_sn),
    itemRows
  );
  const buyerIds = [
    ...new Set(
      details
        .map(d => d.buyer_user_id)
        .filter((id): id is number => !!id && id !== 0)
    ),
  ];
  await upsertBuyers(buyerIds);
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = Math.floor(Date.now() / 1000);

    // 1. New orders: create_time watermark
    const lastCreateStr = await getSyncState('last_create_sync');
    const lastCreate = lastCreateStr ? parseInt(lastCreateStr, 10) : now - 30 * 24 * 60 * 60;

    // Walk in 15-day chunks in case watermark is old
    const newSns: string[] = [];
    let cur = lastCreate;
    while (cur < now) {
      const end = Math.min(cur + CHUNK_SECONDS, now);
      const chunk = await fetchAllSns(cur, end, 'create_time');
      newSns.push(...chunk);
      cur = end;
    }
    await syncOrders([...new Set(newSns)]);
    await setSyncState('last_create_sync', String(now));

    // 2. Updated orders: fixed 30-day window to catch status changes
    const updatedSns = await fetchAllSns(now - UPDATE_WINDOW, now, 'update_time');
    await syncOrders([...new Set(updatedSns)]);
    await setSyncState('last_update_sync', String(now));

    // ── TikTok Shop sync (only if tokens exist) ────────────────────────────
    let tikTokNew = 0;
    let tikTokUpdated = 0;

    const tikTokTokens = await loadTikTokTokens();
    if (tikTokTokens) {
      try {
        // 1. New TikTok orders: create_time watermark
        const ttLastCreateStr = await getSyncState('tiktok_last_create_sync');
        const ttLastCreate    = ttLastCreateStr ? parseInt(ttLastCreateStr, 10) : now - 30 * 24 * 60 * 60;

        const tikTokNewIds: string[] = [];
        let ttCur = ttLastCreate;
        while (ttCur < now) {
          const ttEnd = Math.min(ttCur + CHUNK_SECONDS, now);
          const { orders: ttList } = await fetchTikTokOrderList(ttCur, ttEnd, Infinity);
          tikTokNewIds.push(...ttList.map(o => o.id));
          ttCur = ttEnd;
        }

        if (tikTokNewIds.length) {
          const details = await fetchTikTokOrderDetails([...new Set(tikTokNewIds)]);
          const { orderRows, itemRows } = tikTokOrdersToRows(details);
          await upsertOrderRows(orderRows, 'api');
          await replaceOrderItems(details.map(d => d.id), itemRows);
        }

        await setSyncState('tiktok_last_create_sync', String(now));
        tikTokNew = tikTokNewIds.length;

        // 2. Updated TikTok orders: rolling 30-day window
        const { orders: ttUpdated } = await fetchTikTokOrderList(now - UPDATE_WINDOW, now, Infinity);
        if (ttUpdated.length) {
          const details = await fetchTikTokOrderDetails([...new Set(ttUpdated.map(o => o.id))]);
          const { orderRows, itemRows } = tikTokOrdersToRows(details);
          await upsertOrderRows(orderRows, 'api');
          await replaceOrderItems(details.map(d => d.id), itemRows);
        }
        await setSyncState('tiktok_last_update_sync', String(now));
        tikTokUpdated = ttUpdated.length;
      } catch (ttErr) {
        console.error('TikTok sync error (non-fatal):', ttErr);
      }
    }

    return NextResponse.json({
      ok: true,
      shopee: { new: newSns.length, updated: updatedSns.length },
      tiktok: { new: tikTokNew, updated: tikTokUpdated },
    });
  } catch (err) {
    console.error('sync-customers cron error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
