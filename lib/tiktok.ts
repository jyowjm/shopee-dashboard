import crypto from 'crypto';
import { loadTikTokTokens, saveTikTokTokens } from '@/lib/kv';
import type { TikTokTokens } from '@/types/tiktok';
import type { ApiError } from '@/types/dashboard';

const TIKTOK_BASE = 'https://open-api.tiktokglobalshop.com';
// Auth endpoints are on a separate domain and use GET with query params
const REFRESH_URL = 'https://auth.tiktok-shops.com/api/v2/token/refresh';

/**
 * TikTok Shop Open Platform request signing (v202309).
 *
 * Algorithm:
 *   1. Take all query params except "sign" and "access_token"
 *   2. Sort alphabetically by key
 *   3. Join as key1value1key2value2… (no separators between pairs)
 *   4. message = app_secret + path + joined_params + body_string + app_secret
 *   5. sign = HMAC-SHA256(message, app_secret).hex()
 */
export function signTikTok(
  appSecret: string,
  path: string,
  params: Record<string, string>,
  body = '',
): string {
  const { sign: _s, access_token: _a, ...signingParams } = params;
  const paramStr = Object.entries(signingParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join('');
  const message = appSecret + path + paramStr + body + appSecret;
  return crypto.createHmac('sha256', appSecret).update(message).digest('hex');
}

export async function refreshTikTokAccessToken(tokens: TikTokTokens): Promise<TikTokTokens> {
  const appKey = process.env.TIKTOK_CLIENT_KEY!.trim();
  const appSecret = process.env.TIKTOK_CLIENT_SECRET!.trim();

  // Refresh is also a GET request with query params
  const params = new URLSearchParams({
    app_key: appKey,
    app_secret: appSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${REFRESH_URL}?${params.toString()}`);
  const data = await res.json();
  if (data.code !== 0) {
    const err: ApiError = { type: 'auth', message: `TikTok token refresh failed: ${data.message}` };
    throw err;
  }

  const d = data.data;
  const newTokens: TikTokTokens = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    shop_id: tokens.shop_id,
    shop_cipher: tokens.shop_cipher,
    expires_at: d.access_token_expire_in * 1000, // absolute Unix timestamp → ms
  };
  await saveTikTokTokens(newTokens);
  return newTokens;
}

/**
 * Fetch the list of shops the seller authorized — used right after token exchange
 * to obtain the shop_cipher, which is NOT included in the OAuth callback URL.
 *
 * Signing for this endpoint does NOT use shop_cipher (we don't have it yet).
 */
export async function getAuthorizedShops(
  accessToken: string,
): Promise<Array<{ id: string; name: string; cipher: string }>> {
  const appKey = process.env.TIKTOK_CLIENT_KEY!.trim();
  const appSecret = process.env.TIKTOK_CLIENT_SECRET!.trim();
  const path = '/authorization/202309/shops';
  const timestamp = String(Math.floor(Date.now() / 1000));

  const signingParams: Record<string, string> = { app_key: appKey, timestamp };
  const sign = signTikTok(appSecret, path, signingParams);

  const params = new URLSearchParams({ ...signingParams, sign });
  const res = await fetch(`${TIKTOK_BASE}${path}?${params.toString()}`, {
    headers: { 'x-tts-access-token': accessToken },
  });
  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`Failed to fetch authorized shops: ${data.message} (code ${data.code})`);
  }

  return data.data?.shops ?? [];
}

/**
 * Make an authenticated call to the TikTok Shop Open Platform.
 *
 * @param path    API path, e.g. "/order/202309/orders/search"
 * @param query   Additional query params (app_key, timestamp, shop_cipher, sign are added automatically)
 * @param options Optional method and body for POST requests
 */
export async function callTikTok<T>(
  path: string,
  query: Record<string, string> = {},
  options?: { method?: 'GET' | 'POST'; body?: object },
): Promise<T> {
  let tokens = await loadTikTokTokens();

  if (!tokens) {
    const err: ApiError = {
      type: 'auth',
      message: 'TikTok shop not connected. Please connect your TikTok Shop.',
    };
    throw err;
  }

  // Refresh if expiring within 5 minutes
  if (tokens.expires_at - Date.now() < 5 * 60 * 1000) {
    tokens = await refreshTikTokAccessToken(tokens);
  }

  const appKey = process.env.TIKTOK_CLIENT_KEY!.trim();
  const appSecret = process.env.TIKTOK_CLIENT_SECRET!.trim();
  const timestamp = String(Math.floor(Date.now() / 1000));

  const method = options?.method ?? 'GET';
  const bodyStr = options?.body ? JSON.stringify(options.body) : '';

  const signingParams: Record<string, string> = {
    app_key: appKey,
    timestamp,
    shop_cipher: tokens.shop_cipher,
    ...query,
  };

  const sign = signTikTok(appSecret, path, signingParams, bodyStr);

  const params = new URLSearchParams({
    ...signingParams,
    sign,
  });

  const url = `${TIKTOK_BASE}${path}?${params.toString()}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-tts-access-token': tokens.access_token,
    },
    ...(bodyStr ? { body: bodyStr } : {}),
  });

  const data = await res.json();

  if (data.code === 109 || data.code === 105) {
    const err: ApiError = { type: 'auth', message: data.message ?? 'TikTok auth error' };
    throw err;
  }
  if (data.code === 130006) {
    const err: ApiError = {
      type: 'rate_limit',
      message: 'TikTok rate limit exceeded. Please try again shortly.',
    };
    throw err;
  }
  if (data.code !== 0) {
    const err: ApiError = {
      type: 'api_error',
      message: `TikTok API error ${data.code}: ${data.message}`,
    };
    throw err;
  }

  return data.data as T;
}
