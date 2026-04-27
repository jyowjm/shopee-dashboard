import { Redis } from '@upstash/redis';
import type { ShopeeTokens } from '@/types/shopee';
import type { TikTokTokens } from '@/types/tiktok';

const KV_KEY = 'shopee_tokens';
const AMS_KV_KEY = 'shopee_ams_tokens';
const TIKTOK_KV_KEY = 'tiktok_tokens';

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

// ── TikTok Shop tokens ─────────────────────────────────────────────────────
export async function saveTikTokTokens(tokens: TikTokTokens): Promise<void> {
  await getRedis().set(TIKTOK_KV_KEY, tokens);
}

export async function loadTikTokTokens(): Promise<TikTokTokens | null> {
  return await getRedis().get<TikTokTokens>(TIKTOK_KV_KEY);
}

export async function deleteTikTokTokens(): Promise<void> {
  await getRedis().del(TIKTOK_KV_KEY);
}
