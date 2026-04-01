jest.mock('@vercel/kv', () => ({
  kv: {
    set: jest.fn(),
    get: jest.fn(),
  },
}));

import { kv } from '@vercel/kv';
import { saveTokens, loadTokens } from '@/lib/kv';
import type { ShopeeTokens } from '@/types/shopee';

const mockKv = kv as jest.Mocked<typeof kv>;

const sampleTokens: ShopeeTokens = {
  access_token: 'acc_123',
  refresh_token: 'ref_456',
  shop_id: 9876543,
  expires_at: Date.now() + 3600_000,
};

describe('saveTokens()', () => {
  it('saves tokens to KV under key "shopee_tokens"', async () => {
    mockKv.set.mockResolvedValue('OK');
    await saveTokens(sampleTokens);
    expect(mockKv.set).toHaveBeenCalledWith('shopee_tokens', sampleTokens);
  });
});

describe('loadTokens()', () => {
  it('returns tokens when they exist in KV', async () => {
    mockKv.get.mockResolvedValue(sampleTokens);
    const result = await loadTokens();
    expect(result).toEqual(sampleTokens);
  });

  it('returns null when no tokens exist', async () => {
    mockKv.get.mockResolvedValue(null);
    const result = await loadTokens();
    expect(result).toBeNull();
  });
});
