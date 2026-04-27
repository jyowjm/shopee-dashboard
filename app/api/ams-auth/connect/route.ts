import { NextResponse } from 'next/server';
import { signAms, getAmsBaseUrl } from '@/lib/ams-shopee';

export async function GET() {
  const partnerId = parseInt(process.env.SHOPEE_AMS_PARTNER_ID!, 10);
  const partnerKey = process.env.SHOPEE_AMS_PARTNER_KEY!;
  const redirectUrl = process.env.SHOPEE_REDIRECT_URL! + '/api/ams-auth/callback';
  const timestamp = Math.floor(Date.now() / 1000);
  const apiPath = '/api/v2/shop/auth_partner';
  const sig = signAms(partnerId, partnerKey, apiPath, timestamp);

  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign: sig,
    redirect: redirectUrl,
  });

  return NextResponse.redirect(`${getAmsBaseUrl()}${apiPath}?${params.toString()}`);
}
