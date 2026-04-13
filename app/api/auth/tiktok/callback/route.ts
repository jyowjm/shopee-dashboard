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

  // Log token response shape for debugging (no secret values)
  console.log('[TikTok callback] token response keys:', JSON.stringify(Object.keys(d)));
  console.log('[TikTok callback] shops in token response:', JSON.stringify(d.shops ?? null));
  console.log('[TikTok callback] shopId from URL:', shopId);

  // 1. Try to get shop info directly from token exchange response
  //    (202309/202407 both include a shops[] array in the response)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopFromToken: any = d.shops?.find((s: any) => s.id === shopId) ?? d.shops?.[0];
  let shopCipher    = (shopFromToken?.cipher as string) ?? '';
  let resolvedShopId = (shopFromToken?.id as string)    ?? shopId ?? '';

  // 2. If token response had no shops, fall back to /authorization/202309/shops
  if (!shopCipher) {
    try {
      const shops = await getAuthorizedShops(accessToken);
      const match = shops.find(s => s.id === resolvedShopId) ?? shops[0];
      shopCipher     = match?.cipher     ?? '';
      resolvedShopId = match?.id         ?? resolvedShopId;
    } catch (e) {
      console.error('[TikTok callback] getAuthorizedShops failed:', (e as Error).message);
    }
  }

  console.log('[TikTok callback] resolved shop_id:', resolvedShopId, '| cipher present:', !!shopCipher);

  // access_token_expire_in is an absolute Unix timestamp (seconds), not a duration
  await saveTikTokTokens({
    access_token:  accessToken,
    refresh_token: d.refresh_token,
    shop_id:       resolvedShopId || d.seller_base_region || '',
    shop_cipher:   shopCipher,
    expires_at:    d.access_token_expire_in * 1000,  // Unix seconds → ms
  });

  return NextResponse.redirect(new URL('/', req.url));
}
