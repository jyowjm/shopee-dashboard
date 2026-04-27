// Re-fetches orders that were missed during the backfill (rate-limit batch failures).
// Run with: npx tsx sync/patch-missing.ts
//
// What it does:
//   1. Walks the order list for the affected period in 15-day chunks
//   2. For each chunk, finds SNs that are either:
//      a. Completely missing from the DB
//      b. In the DB but buyer_user_id IS NULL and is_paid_order = true
//   3. Re-fetches details for those SNs with slower batching + retries

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { fetchOrderSummaries } from '../lib/orders';
import { apiOrderToRows, upsertOrderRows, replaceOrderItems, upsertBuyers } from '../lib/db-sync';
import { callShopee } from '../lib/shopee';
import { getSupabase } from '../lib/supabase';
import type { ShopeeOrderDetail } from '../types/shopee';

// Period where failures were observed
const PATCH_START = Math.floor(new Date('2020-01-01T00:00:00Z').getTime() / 1000);
const PATCH_END = Math.floor(Date.now() / 1000);

const CHUNK_SECONDS = 15 * 24 * 60 * 60;
const BATCH_SIZE = 20; // smaller batches to reduce rate-limit risk
const BATCH_DELAY_MS = 500; // delay between batches
const RETRY_DELAY_MS = 3000;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Fetch details with slower batching and per-batch retries
async function fetchDetailsCarefully(sns: string[]): Promise<ShopeeOrderDetail[]> {
  const results: ShopeeOrderDetail[] = [];
  const batches: string[][] = [];
  for (let i = 0; i < sns.length; i += BATCH_SIZE) {
    batches.push(sns.slice(i, i + BATCH_SIZE));
  }

  for (const [i, batch] of batches.entries()) {
    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      try {
        const data = await callShopee<{ order_list: ShopeeOrderDetail[] }>(
          '/api/v2/order/get_order_detail',
          {
            order_sn_list: batch.join(','),
            response_optional_fields: [
              'buyer_user_id',
              'buyer_username',
              'recipient_address',
              'total_amount',
              'pay_time',
              'payment_method',
              'shipping_carrier',
              'fulfillment_flag',
              'cancel_reason',
              'cancel_by',
              'buyer_cancel_reason',
              'estimated_shipping_fee',
              'actual_shipping_fee',
              'actual_shipping_fee_confirmed',
              'item_list',
            ].join(','),
          },
        );
        results.push(...(data.order_list ?? []));
        break;
      } catch (err: unknown) {
        attempt++;
        const msg = (err as Error).message ?? String(err);
        if (attempt > MAX_RETRIES) {
          console.log(`    Batch ${i + 1}/${batches.length}: gave up after ${MAX_RETRIES} retries`);
          break;
        }
        console.log(`    Batch ${i + 1}/${batches.length}: retrying (${msg})...`);
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
    if (i < batches.length - 1) await sleep(BATCH_DELAY_MS);
  }

  return results;
}

async function patchChunk(from: number, to: number) {
  const fromDate = new Date(from * 1000).toISOString().split('T')[0];
  const toDate = new Date(to * 1000).toISOString().split('T')[0];

  process.stdout.write(`[${fromDate} → ${toDate}] Fetching order list...`);
  const { orders: summaries } = await fetchOrderSummaries(from, to, Infinity);
  if (!summaries.length) {
    console.log(' 0 orders, skipping.');
    return;
  }
  process.stdout.write(` ${summaries.length} orders.`);

  const allSns = summaries.map((s) => s.order_sn);

  // Find which SNs are missing or have null buyer_user_id on paid orders
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from('orders')
    .select('order_sn, buyer_user_id, is_paid_order')
    .in('order_sn', allSns);

  const existingMap = new Map((existing ?? []).map((r) => [r.order_sn, r]));

  const needsRefetch = allSns.filter((sn) => {
    const row = existingMap.get(sn);
    if (!row) return true; // completely missing
    if (row.is_paid_order && row.buyer_user_id === null) return true; // paid but no buyer ID
    return false;
  });

  if (!needsRefetch.length) {
    console.log(' all present, skipping.');
    return;
  }
  process.stdout.write(` ${needsRefetch.length} to re-fetch...`);

  const details = await fetchDetailsCarefully(needsRefetch);
  if (!details.length) {
    console.log(' 0 fetched (all batches failed).');
    return;
  }

  const { orderRows, itemRows } = apiOrderToRows(details);
  await upsertOrderRows(orderRows, 'api');
  await replaceOrderItems(
    details.map((d) => d.order_sn),
    itemRows,
  );

  const buyerIds = [
    ...new Set(details.map((d) => d.buyer_user_id).filter((id): id is number => !!id && id !== 0)),
  ];
  await upsertBuyers(buyerIds);

  console.log(` ${details.length} patched. (${buyerIds.length} buyers updated)`);
}

async function main() {
  console.log(
    `Patching missing orders from ${new Date(PATCH_START * 1000).toISOString().split('T')[0]} to now...`,
  );
  let cur = PATCH_START;
  while (cur < PATCH_END) {
    const end = Math.min(cur + CHUNK_SECONDS, PATCH_END);
    try {
      await patchChunk(cur, end);
    } catch (err: unknown) {
      console.log(` ERROR: ${(err as Error).message}`);
    }
    cur = end;
    await sleep(200);
  }
  console.log('Patch complete!');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
