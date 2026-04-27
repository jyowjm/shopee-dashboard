jest.mock('@/lib/kv', () => ({
  loadTokens: jest.fn(),
  saveTokens: jest.fn(),
}));

import { loadTokens, saveTokens } from '@/lib/kv';
import { sign, getBaseUrl, callShopee, refreshAccessToken } from '@/lib/shopee';

const mockLoadTokens = loadTokens as jest.MockedFunction<typeof loadTokens>;
const mockSaveTokens = saveTokens as jest.MockedFunction<typeof saveTokens>;

// ─── sign() tests ─────────────────────────────────────────────────────────────

describe('sign()', () => {
  it('produces the correct HMAC-SHA256 signature for an unauthenticated call', () => {
    const partnerId = 1234567;
    const partnerKey = 'test_key_abcdefghijklmnopqrstuvwxyz012345';
    const apiPath = '/api/v2/shop/auth_partner';
    const timestamp = 1620000000;
    const result = sign(partnerId, partnerKey, apiPath, timestamp);
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', partnerKey)
      .update(`${partnerId}${apiPath}${timestamp}`)
      .digest('hex');
    expect(result).toBe(expected);
  });

  it('includes access_token and shop_id for authenticated calls', () => {
    const partnerId = 1234567;
    const partnerKey = 'test_key_abcdefghijklmnopqrstuvwxyz012345';
    const apiPath = '/api/v2/order/get_order_list';
    const timestamp = 1620000000;
    const accessToken = 'mytoken';
    const shopId = 9876543;
    const result = sign(partnerId, partnerKey, apiPath, timestamp, accessToken, shopId);
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', partnerKey)
      .update(`${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`)
      .digest('hex');
    expect(result).toBe(expected);
  });
});

describe('getBaseUrl()', () => {
  const original = process.env.SHOPEE_ENV;
  afterEach(() => {
    process.env.SHOPEE_ENV = original;
  });
  it('returns sandbox URL when SHOPEE_ENV is sandbox', () => {
    process.env.SHOPEE_ENV = 'sandbox';
    expect(getBaseUrl()).toBe('https://openplatform.sandbox.test-stable.shopee.sg');
  });
  it('returns production URL when SHOPEE_ENV is production', () => {
    process.env.SHOPEE_ENV = 'production';
    expect(getBaseUrl()).toBe('https://partner.shopeemobile.com');
  });
});

// ─── callShopee() tests ───────────────────────────────────────────────────────

const validTokens = {
  access_token: 'acc_valid',
  refresh_token: 'ref_valid',
  shop_id: 9876543,
  expires_at: Date.now() + 3_600_000, // 1 hour from now
};

const expiredTokens = {
  ...validTokens,
  expires_at: Date.now() - 1000, // already expired
};

global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('callShopee()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SHOPEE_PARTNER_ID = '1234567';
    process.env.SHOPEE_PARTNER_KEY = 'test_key_abcdefghijklmnopqrstuvwxyz012345';
    process.env.SHOPEE_ENV = 'sandbox';
  });

  it('throws auth error when no tokens in KV', async () => {
    mockLoadTokens.mockResolvedValue(null);
    await expect(callShopee('/api/v2/shop/get_shop_info', {})).rejects.toMatchObject({
      type: 'auth',
    });
  });

  it('calls the Shopee API and returns data when token is valid', async () => {
    mockLoadTokens.mockResolvedValue(validTokens);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ shop_name: 'My Shop', error: '' }),
    } as Response);

    const result = await callShopee<{ shop_name: string }>('/api/v2/shop/get_shop_info', {});
    expect(result.shop_name).toBe('My Shop');
  });

  it('refreshes token when expired and retries the call', async () => {
    mockLoadTokens.mockResolvedValue(expiredTokens);
    mockSaveTokens.mockResolvedValue(undefined);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new_acc',
          refresh_token: 'new_ref',
          expire_in: 14400,
          error: '',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ shop_name: 'My Shop', error: '' }),
      } as Response);

    const result = await callShopee<{ shop_name: string }>('/api/v2/shop/get_shop_info', {});
    expect(mockSaveTokens).toHaveBeenCalled();
    expect(result.shop_name).toBe('My Shop');
  });
});
