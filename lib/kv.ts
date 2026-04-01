import type { ShopeeTokens } from '@/types/shopee';

// Stub — real implementation is Task 4
export async function loadTokens(): Promise<ShopeeTokens | null> {
  throw new Error('Not implemented');
}

export async function saveTokens(_tokens: ShopeeTokens): Promise<void> {
  throw new Error('Not implemented');
}
