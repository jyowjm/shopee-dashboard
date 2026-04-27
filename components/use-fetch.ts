'use client';

import { useEffect, useState, type DependencyList } from 'react';

/**
 * Run a loader whenever `deps` change; re-runs are cancellable so older fetches
 * can't overwrite the newer state if the user clicks Refresh rapidly.
 *
 * Sections were each repeating this state machine inline — this hook consolidates
 * loading / error / data into one place plus exposes a `retry` for the error UI.
 */
export function useFetch<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The caller's deps drive re-fetches; loader identity intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, retryKey]);

  return { data, loading, error, retry: () => setRetryKey((k) => k + 1) };
}
