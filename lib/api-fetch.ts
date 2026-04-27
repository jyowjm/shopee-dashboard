/**
 * GET a dashboard API route and return its parsed JSON body.
 *
 * Centralises the 401 → "Session expired" + non-OK error handling that every
 * Section component used to repeat inline.
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    throw new Error('Session expired — please reconnect your shop.');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // body wasn't JSON — keep the generic message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
