import { NextResponse } from 'next/server';
import { loadTikTokTokens, saveTikTokTokens } from '@/lib/kv';
import { getAuthorizedShops } from '@/lib/tiktok';

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

  // Always refresh cipher from the authorized shops endpoint
  let shopsResult: unknown;
  let cipherPatched = false;
  try {
    const shops = await getAuthorizedShops(tokens.access_token);
    shopsResult = shops.map(s => ({
      id:     s.id,
      name:   s.name,
      cipher: s.cipher ? `${s.cipher.slice(0, 12)}…` : '(empty)',
    }));

    // Always update with the freshest cipher from TikTok
    if (shops.length > 0) {
      const match = shops.find(s => s.id === tokens.shop_id) ?? shops[0];
      if (match?.cipher && match.cipher !== tokens.shop_cipher) {
        await saveTikTokTokens({ ...tokens, shop_id: match.id, shop_cipher: match.cipher });
        cipherPatched = true;
      }
    }
  } catch (e) {
    shopsResult = { error: (e as Error).message };
  }

  return NextResponse.json({
    connected: true,
    shop_id:        tokens.shop_id,
    shop_cipher:    tokens.shop_cipher   ? `${tokens.shop_cipher.slice(0, 12)}…` : '(empty)',
    access_token:   tokens.access_token  ? `${tokens.access_token.slice(0, 8)}…`  : '(empty)',
    refresh_token:  tokens.refresh_token ? `${tokens.refresh_token.slice(0, 8)}…` : '(empty)',
    expires_at_ms:  tokens.expires_at,
    expires_at_iso: new Date(tokens.expires_at).toISOString(),
    expired:        tokens.expires_at < now,
    ttl_minutes:    Math.round((tokens.expires_at - now) / 60_000),
    shops_api:      shopsResult,
    cipher_patched: cipherPatched,
  });
}
