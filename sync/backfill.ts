// Run with: npx tsx sync/backfill.ts
// Requires .env.local with all Shopee + Supabase env vars

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { fetchOrderSummaries } from '../lib/orders';
import {
  fetchOrderDetails,
  apiOrderToRows,
  upsertOrderRows,
  replaceOrderItems,
  upsertBuyers,
  getSyncState,
  setSyncState,
} from '../lib/db-sync';

const BACKFILL_START = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000);
const CHUNK_SECONDS = 15 * 24 * 60 * 60;
const SLEEP_MS = 200;
const RATE_LIMIT_SLEEP_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncChunk(from: number, to: number, attempt = 1): Promise<void> {
  const fromDate = new Date(from * 1000).toISOString().split('T')[0];
  const toDate = new Date(to * 1000).toISOString().split('T')[0];
  process.stdout.write(`[${fromDate} → ${toDate}] Fetching order list...`);

  let summaries: { order_sn: string; order_status: string }[];
  try {
    const result = await fetchOrderSummaries(from, to, Infinity);
    summaries = result.orders;
  } catch (err: unknown) {
    const e = err as { type?: string; message?: string };
    if (e.type === 'rate_limit' && attempt <= 1) {
      console.log(' rate limited, retrying in 2s...');
      await sleep(RATE_LIMIT_SLEEP_MS);
      return syncChunk(from, to, attempt + 1);
    }
    console.log(` ERROR: ${e.message ?? String(err)}`);
    return;
  }

  process.stdout.write(` ${summaries.length} orders. Fetching details...`);

  let details;
  try {
    details = await fetchOrderDetails(summaries.map(s => s.order_sn));
  } catch (err: unknown) {
    const e = err as { type?: string; message?: string };
    if (e.type === 'rate_limit' && attempt <= 1) {
      console.log(' rate limited, retrying in 2s...');
      await sleep(RATE_LIMIT_SLEEP_MS);
      return syncChunk(from, to, attempt + 1);
    }
    console.log(` ERROR: ${e.message ?? String(err)}`);
    return;
  }

  process.stdout.write(` ${details.length} detailed. Upserting...`);

  const { orderRows, itemRows } = apiOrderToRows(details);
  await upsertOrderRows(orderRows, 'api');

  const sns = details.map(d => d.order_sn);
  await replaceOrderItems(sns, itemRows);

  const buyerIds = [
    ...new Set(
      details
        .map(d => d.buyer_user_id)
        .filter((id): id is number => !!id && id !== 0)
    ),
  ];
  await upsertBuyers(buyerIds);

  console.log(` done. (${buyerIds.length} buyers updated)`);
}

async function main() {
  const done = await getSyncState('backfill_done');
  if (done === 'true') {
    console.log('Backfill already completed. Delete sync_state row "backfill_done" to re-run.');
    return;
  }

  const cursorStr = await getSyncState('backfill_cursor');
  const cursor = cursorStr ? parseInt(cursorStr, 10) : BACKFILL_START;
  const now = Math.floor(Date.now() / 1000);

  console.log(`Starting backfill from ${new Date(cursor * 1000).toISOString()} to now (${new Date(now * 1000).toISOString()})`);

  let current = cursor;
  while (current < now) {
    const chunkEnd = Math.min(current + CHUNK_SECONDS, now);
    await syncChunk(current, chunkEnd);
    await setSyncState('backfill_cursor', String(chunkEnd));
    current = chunkEnd;
    if (current < now) await sleep(SLEEP_MS);
  }

  await setSyncState('backfill_done', 'true');
  await setSyncState('last_create_sync', String(now));
  console.log('Backfill complete!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
