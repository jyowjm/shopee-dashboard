import { kv } from '@vercel/kv';
import type { ShopeeTokens } from '@/types/shopee';

const KV_KEY = 'shopee_tokens';

export async function saveTokens(tokens: ShopeeTokens): Promise<void> {
  await kv.set(KV_KEY, tokens);
}

export async function loadTokens(): Promise<ShopeeTokens | null> {
  return await kv.get<ShopeeTokens>(KV_KEY);
}
