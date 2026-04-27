import crypto from 'crypto';
import { loadTokens, saveTokens } from '@/lib/kv';
import type { ShopeeTokens } from '@/types/shopee';
import type { ApiError } from '@/types/dashboard';

const SANDBOX_BASE = 'https://openplatform.sandbox.test-stable.shopee.sg';
const PROD_BASE = 'https://partner.shopeemobile.com';

export function getBaseUrl(): string {
  return process.env.SHOPEE_ENV === 'production' ? PROD_BASE : SANDBOX_BASE;
}

export function sign(
  partnerId: number,
  partnerKey: string,
  apiPath: string,
  timestamp: number,
  accessToken: string = '',
  shopId: number | string = '',
): string {
  const base = `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`;
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

export async function refreshAccessToken(tokens: ShopeeTokens): Promise<ShopeeTokens> {
  const partnerId = parseInt(process.env.SHOPEE_PARTNER_ID!, 10);
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const apiPath = '/api/v2/auth/access_token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = sign(partnerId, partnerKey, apiPath, timestamp);

  const res = await fetch(
    `${getBaseUrl()}${apiPath}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sig}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: tokens.shop_id,
        refresh_token: tokens.refresh_token,
        partner_id: partnerId,
      }),
    },
  );

  const data = await res.json();
  if (data.error) {
    const err: ApiError = { type: 'auth', message: `Token refresh failed: ${data.message}` };
    throw err;
  }

  const newTokens: ShopeeTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    shop_id: tokens.shop_id,
    expires_at: Date.now() + data.expire_in * 1000,
  };
  await saveTokens(newTokens);
  return newTokens;
}

export async function callShopee<T>(
  apiPath: string,
  queryParams: Record<string, string | number>,
  options?: { method?: 'GET' | 'POST'; body?: object },
): Promise<T> {
  let tokens = await loadTokens();

  if (!tokens) {
    const err: ApiError = { type: 'auth', message: 'No tokens found. Please reconnect your shop.' };
    throw err;
  }

  // Refresh if expiring within 5 minutes
  if (tokens.expires_at - Date.now() < 5 * 60 * 1000) {
    tokens = await refreshAccessToken(tokens);
  }

  const partnerId = parseInt(process.env.SHOPEE_PARTNER_ID!, 10);
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = sign(partnerId, partnerKey, apiPath, timestamp, tokens.access_token, tokens.shop_id);

  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign: sig,
    access_token: tokens.access_token,
    shop_id: String(tokens.shop_id),
    ...Object.fromEntries(Object.entries(queryParams).map(([k, v]) => [k, String(v)])),
  });

  const url = `${getBaseUrl()}${apiPath}?${params.toString()}`;
  const method = options?.method ?? 'GET';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const data = await res.json();

  if (data.error === 'error_auth') {
    const err: ApiError = { type: 'auth', message: data.message };
    throw err;
  }
  if (data.error === 'error_too_many_request') {
    const err: ApiError = {
      type: 'rate_limit',
      message: 'Too many requests. Please try again in a moment.',
    };
    throw err;
  }
  if (data.error && data.error !== '') {
    const err: ApiError = { type: 'api_error', message: `${data.error}: ${data.message}` };
    throw err;
  }

  return (data.response ?? data) as T;
}

/** Like loadTokens but throws if no tokens are stored (shop not connected) */
export async function loadTokensOrThrow(): Promise<ShopeeTokens> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error('Shop not connected. Please authenticate first.');
  return tokens;
}
