import { NextRequest, NextResponse } from 'next/server';
import { saveTikTokTokens } from '@/lib/kv';

const TOKEN_URL = 'https://open-api.tiktokglobalshop.com/api/v2/token/get';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code       = searchParams.get('code');
  const shopId     = searchParams.get('shop_id');
  const shopCipher = searchParams.get('shop_cipher');

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  const appKey    = process.env.TIKTOK_CLIENT_KEY!;
  const appSecret = process.env.TIKTOK_CLIENT_SECRET!;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_key:    appKey,
      app_secret: appSecret,
      auth_code:  code,
      grant_type: 'authorized_code',
    }),
  });

  const data = await res.json();

  if (data.code !== 0) {
    return NextResponse.json(
      { error: data.message ?? 'Token exchange failed' },
      { status: 400 }
    );
  }

  const d = data.data;

  await saveTikTokTokens({
    access_token:  d.access_token,
    refresh_token: d.refresh_token,
    // Use shop_id / shop_cipher from callback params if available (populated after shop selection),
    // otherwise fall back to first shop in the token response.
    shop_id:     shopId     ?? d.seller_base_region ?? '',
    shop_cipher: shopCipher ?? d.shops?.[0]?.cipher ?? '',
    expires_at:  Date.now() + d.access_token_expire_in * 1000,
  });

  return NextResponse.redirect(new URL('/', req.url));
}
