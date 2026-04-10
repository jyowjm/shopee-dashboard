import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export async function GET() {
  const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
  await redis.del('tiktok_tokens');
  return NextResponse.redirect(
    new URL('/connect', process.env.NEXT_PUBLIC_APP_URL ?? 'https://shopee-dashboard-seven.vercel.app')
  );
}
