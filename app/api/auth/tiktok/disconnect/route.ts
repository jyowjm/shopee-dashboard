import { NextRequest, NextResponse } from 'next/server';
import { deleteTikTokTokens } from '@/lib/kv';

export async function GET(req: NextRequest) {
  await deleteTikTokTokens();
  return NextResponse.redirect(new URL('/connect', req.url));
}
