import { Redis } from '@upstash/redis';
import type { ShopeeTokens } from '@/types/shopee';

const KV_KEY     = 'shopee_tokens';
const AMS_KV_KEY = 'shopee_ams_tokens';

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

// ── AMS Management app tokens ──────────────────────────────────────────────
export async function saveAmsTokens(tokens: ShopeeTokens): Promise<void> {
  await getRedis().set(AMS_KV_KEY, tokens);
}

export async function loadAmsTokens(): Promise<ShopeeTokens | null> {
  return await getRedis().get<ShopeeTokens>(AMS_KV_KEY);
}
