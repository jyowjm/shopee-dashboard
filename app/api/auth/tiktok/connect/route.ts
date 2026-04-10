import { NextResponse } from 'next/server';

const AUTHORIZE_URL = 'https://services.tiktokshop.com/open/authorize';

export async function GET() {
  const appKey      = process.env.TIKTOK_CLIENT_KEY!.trim();
  const redirectUrl = process.env.TIKTOK_REDIRECT_URL!.trim() + '/api/auth/tiktok/callback';

  const params = new URLSearchParams({
    app_key:      appKey,
    redirect_uri: redirectUrl,
  });

  return NextResponse.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
}
