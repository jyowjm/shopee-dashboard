import { NextResponse } from 'next/server';

const AUTHORIZE_URL = 'https://services.tiktokshop.com/open/authorize';

export async function GET() {
  // The service_id is the numeric app ID shown on your Partner Center app page
  // (distinct from app_key). The redirect_uri is configured in the app, not sent here.
  const serviceId = process.env.TIKTOK_SERVICE_ID!.trim();

  const params = new URLSearchParams({ service_id: serviceId });

  return NextResponse.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
}
