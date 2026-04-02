import { NextResponse } from 'next/server';
import { sign, getBaseUrl } from '@/lib/shopee';

export async function GET() {
  const partnerId = parseInt(process.env.SHOPEE_PARTNER_ID!, 10);
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  console.log('[connect] partnerId:', partnerId, '| keyLength:', partnerKey?.length, '| keyFirst4:', partnerKey?.slice(0, 4), '| keyLast4:', partnerKey?.slice(-4));
  const redirectUrl = process.env.SHOPEE_REDIRECT_URL! + '/api/auth/callback';
  const timestamp = Math.floor(Date.now() / 1000);
  const apiPath = '/api/v2/shop/auth_partner';
  const sig = sign(partnerId, partnerKey, apiPath, timestamp);

  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign: sig,
    redirect: redirectUrl,
  });

  return NextResponse.redirect(`${getBaseUrl()}${apiPath}?${params.toString()}`);
}
