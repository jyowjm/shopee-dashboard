import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return _client;
}

const PAGE_SIZE = 1000;

/**
 * Walk a Supabase select query in 1000-row pages until exhausted, collecting all rows.
 * `buildQuery(from, to)` should return the same filtered query each time, with
 * `.range(from, to)` already applied — see existing call sites.
 */
export async function paginateAll<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}
