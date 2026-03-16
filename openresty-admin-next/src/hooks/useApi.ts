'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { config } from '@/lib/config/env';
import { createDataProvider } from '@/lib/api/data-provider';
import type { DataProvider } from '@/lib/api/data-provider';

// ---------------------------------------------------------------------------
// Raw client for use outside React components
// ---------------------------------------------------------------------------

export const apiClient: DataProvider = createDataProvider(config.apiUrl);

// ---------------------------------------------------------------------------
// useApi — memoised data provider hook
// ---------------------------------------------------------------------------

export function useApi(): DataProvider {
  const provider = useMemo(() => createDataProvider(config.apiUrl), []);
  return provider;
}

// ---------------------------------------------------------------------------
// useFetch — generic async data-fetching hook
// ---------------------------------------------------------------------------

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useFetch<T>(fetcher: () => Promise<T>): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => {
    setTrigger((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // Re-run when trigger changes (via refetch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return { data, loading, error, refetch };
}
