"use client";
/* ──────────────────────────────────────────────────────────────────────────
   SWR-based React hooks for data fetching.
   Wraps the plain `dataProvider` with caching, deduplication, and
   automatic revalidation — the recommended pattern for client-side
   fetching in Next.js App Router.
   ────────────────────────────────────────────────────────────────────────── */

import useSWR, { type SWRConfiguration } from "swr";
import { useCallback, useMemo } from "react";
import { dataProvider } from "@/lib/api/data-provider";
import { ApiError } from "@/lib/api/client";
import type { ListParams, ListResult, SingleResult } from "@/types";

/**
 * Should SWR retry this fetch?  Skip the retry for errors where
 * retrying is pointless or harmful:
 *  - 401/403: caller is unauthenticated/forbidden — middleware will
 *    redirect to /login on the next navigation; spamming retries
 *    just floods the auth layer.
 *  - 404: resource doesn't exist; retrying won't change that.
 *  - 422: payload itself is invalid; only a code change fixes it.
 *
 * Anything else (network 0, timeout 408, 5xx, transient 502) is
 * worth retrying with backoff.
 */
function shouldRetryOnError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return ![401, 403, 404, 422].includes(err.status);
  }
  return true;
}

const defaultListConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 5_000,
  keepPreviousData: true,
  // Up to 3 retries with exponential backoff (1s → 2s → 4s, capped
  // at 10s) for transient failures.  Halts immediately on auth /
  // not-found / validation errors via `shouldRetryOnError`.
  errorRetryCount: 3,
  errorRetryInterval: 1_000,
  shouldRetryOnError,
  onErrorRetry: (err, _key, _cfg, revalidate, { retryCount }) => {
    if (!shouldRetryOnError(err)) return;
    if (retryCount >= 3) return;
    const delay = Math.min(1_000 * 2 ** retryCount, 10_000);
    setTimeout(() => revalidate({ retryCount }), delay);
  },
};

const defaultOneConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 10_000,
  errorRetryCount: 3,
  errorRetryInterval: 1_000,
  shouldRetryOnError,
  onErrorRetry: (err, _key, _cfg, revalidate, { retryCount }) => {
    if (!shouldRetryOnError(err)) return;
    if (retryCount >= 3) return;
    const delay = Math.min(1_000 * 2 ** retryCount, 10_000);
    setTimeout(() => revalidate({ retryCount }), delay);
  },
};

/**
 * Fetch a paginated, sortable, filterable list.
 *
 * ```tsx
 * const { data, total, isLoading, mutate } = useList<Server>("servers", params);
 * ```
 */
export function useList<T = unknown>(
  resource: string | null,
  params: ListParams = {},
  config?: SWRConfiguration,
) {
  const stableKey = useMemo(
    () => (resource ? [resource, JSON.stringify(params)] : null),
    [resource, JSON.stringify(params)],
  );

  const fetcher = useCallback(
    () => dataProvider.getList<T>(resource!, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableKey],
  );

  const { data, error, isLoading, isValidating, mutate } = useSWR<ListResult<T>>(
    stableKey,
    fetcher,
    { ...defaultListConfig, ...config },
  );

  return {
    data: Array.isArray(data?.data) ? data.data : [],
    total: data?.total ?? 0,
    isLoading,
    isValidating,
    error,
    mutate,
  };
}

/**
 * Fetch a single record.
 *
 * ```tsx
 * const { data, isLoading } = useOne<Server>("servers", id);
 * ```
 */
export function useOne<T = unknown>(
  resource: string | null,
  id: string | undefined | null,
  config?: SWRConfiguration,
) {
  const key = useMemo(
    () => (resource && id ? [resource, id] : null),
    [resource, id],
  );

  const fetcher = useCallback(
    () => dataProvider.getOne<T>(resource!, id!),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const { data, error, isLoading, mutate } = useSWR<SingleResult<T>>(
    key,
    fetcher,
    { ...defaultOneConfig, ...config },
  );

  return {
    data: data?.data ?? null,
    isLoading,
    error,
    mutate,
  };
}

/** Direct access to the dataProvider (no SWR). */
export function useDataProvider() {
  return dataProvider;
}
