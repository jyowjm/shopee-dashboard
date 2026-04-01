import type { ShopeeTokens } from '@/types/shopee';

const sampleTokens: ShopeeTokens = {
  access_token: 'acc_123',
  refresh_token: 'ref_456',
  shop_id: 9876543,
  expires_at: Date.now() + 3600_000,
};

describe('saveTokens()', () => {
  const mockSet = jest.fn();
  const mockGet = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('@upstash/redis', () => ({
      Redis: jest.fn().mockReturnValue({ set: mockSet, get: mockGet }),
    }));
    mockSet.mockReset();
    mockGet.mockReset();
  });

  it('saves tokens under key "shopee_tokens"', async () => {
    const { saveTokens } = await import('@/lib/kv');
    mockSet.mockResolvedValue('OK');
    await saveTokens(sampleTokens);
    expect(mockSet).toHaveBeenCalledWith('shopee_tokens', sampleTokens);
  });
});

describe('loadTokens()', () => {
  const mockSet = jest.fn();
  const mockGet = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('@upstash/redis', () => ({
      Redis: jest.fn().mockReturnValue({ set: mockSet, get: mockGet }),
    }));
    mockSet.mockReset();
    mockGet.mockReset();
  });

  it('returns tokens when they exist in KV', async () => {
    const { loadTokens } = await import('@/lib/kv');
    mockGet.mockResolvedValue(sampleTokens);
    const result = await loadTokens();
    expect(result).toEqual(sampleTokens);
  });

  it('returns null when no tokens exist', async () => {
    const { loadTokens } = await import('@/lib/kv');
    mockGet.mockResolvedValue(null);
    const result = await loadTokens();
    expect(result).toBeNull();
  });
});
