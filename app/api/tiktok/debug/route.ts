import { NextResponse } from 'next/server';
import { loadTikTokTokens } from '@/lib/kv';

/**
 * Debug endpoint — returns stored TikTok token metadata (NOT the actual tokens).
 * Remove this route once the integration is verified working.
 */
export async function GET() {
  const tokens = await loadTikTokTokens();
  if (!tokens) {
    return NextResponse.json({ connected: false });
  }

  const now = Date.now();
  return NextResponse.json({
    connected: true,
    shop_id:        tokens.shop_id,
    shop_cipher:    tokens.shop_cipher   ? `${tokens.shop_cipher.slice(0, 8)}…` : '(empty)',
    access_token:   tokens.access_token  ? `${tokens.access_token.slice(0, 8)}…`  : '(empty)',
    refresh_token:  tokens.refresh_token ? `${tokens.refresh_token.slice(0, 8)}…` : '(empty)',
    expires_at_ms:  tokens.expires_at,
    expires_at_iso: new Date(tokens.expires_at).toISOString(),
    expired:        tokens.expires_at < now,
    ttl_minutes:    Math.round((tokens.expires_at - now) / 60_000),
  });
}
