import { NextRequest, NextResponse } from 'next/server';
import { sign, getBaseUrl } from '@/lib/shopee';
import { saveTokens } from '@/lib/kv';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const shopIdStr = searchParams.get('shop_id');

    if (!code || !shopIdStr) {
      return NextResponse.json({ error: 'Missing code or shop_id' }, { status: 400 });
    }

    const partnerId = parseInt(process.env.SHOPEE_PARTNER_ID!, 10);
    const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
    const shopId = parseInt(shopIdStr, 10);
    const timestamp = Math.floor(Date.now() / 1000);
    const apiPath = '/api/v2/auth/token/get';
    const sig = sign(partnerId, partnerKey, apiPath, timestamp);

    const res = await fetch(
      `${getBaseUrl()}${apiPath}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sig}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, shop_id: shopId, partner_id: partnerId }),
      },
    );

    const data = await res.json();

    if (data.error) {
      return NextResponse.json({ error: data.error, message: data.message }, { status: 400 });
    }

    await saveTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      shop_id: shopId,
      expires_at: Date.now() + data.expire_in * 1000,
    });

    return NextResponse.redirect(new URL('/', req.url));
  } catch (err) {
    console.error('shopee auth callback error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
