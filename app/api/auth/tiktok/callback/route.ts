import { NextRequest, NextResponse } from 'next/server';
import { saveTikTokTokens } from '@/lib/kv';
import { getAuthorizedShops } from '@/lib/tiktok';

// Auth endpoints live on auth.tiktok-shops.com, not open-api.tiktokglobalshop.com
// Requests are GET with query params (not POST with JSON body)
const TOKEN_BASE = 'https://auth.tiktok-shops.com/api/v2/token/get';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code   = searchParams.get('code');
  const shopId = searchParams.get('shop_id');

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  const appKey    = process.env.TIKTOK_CLIENT_KEY!.trim();
  const appSecret = process.env.TIKTOK_CLIENT_SECRET!.trim();

  // Token exchange is a GET request with query params
  const params = new URLSearchParams({
    app_key:    appKey,
    app_secret: appSecret,
    auth_code:  code,
    grant_type: 'authorized_code',
  });

  const res  = await fetch(`${TOKEN_BASE}?${params.toString()}`);
  const data = await res.json();

  if (data.code !== 0) {
    return NextResponse.json(
      { error: `Token exchange failed (${data.code}): ${data.message}` },
      { status: 400 }
    );
  }

  const d = data.data;
  const accessToken = d.access_token as string;

  // shop_cipher is NOT in the callback URL — fetch it from the authorized shops list
  let shopCipher = '';
  try {
    const shops = await getAuthorizedShops(accessToken);
    // Match by shop_id if provided, otherwise take the first shop
    const match = shopId
      ? shops.find(s => s.id === shopId) ?? shops[0]
      : shops[0];
    shopCipher = match?.cipher ?? '';
  } catch (e) {
    // Non-fatal — store empty cipher; user can reconnect if API calls fail
    console.error('Could not fetch shop cipher:', e);
  }

  // access_token_expire_in is an absolute Unix timestamp (seconds), not a duration
  await saveTikTokTokens({
    access_token:  accessToken,
    refresh_token: d.refresh_token,
    shop_id:       shopId ?? d.seller_base_region ?? '',
    shop_cipher:   shopCipher,
    expires_at:    d.access_token_expire_in * 1000,  // Unix seconds → ms
  });

  return NextResponse.redirect(new URL('/', req.url));
}
