import { Redis } from '@upstash/redis';
import type { ShopeeTokens } from '@/types/shopee';

const KV_KEY = 'shopee_tokens';

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return _redis;
}

export async function saveTokens(tokens: ShopeeTokens): Promise<void> {
  await getRedis().set(KV_KEY, tokens);
}

export async function loadTokens(): Promise<ShopeeTokens | null> {
  return await getRedis().get<ShopeeTokens>(KV_KEY);
}
