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
import type { ListParams, ListResult, SingleResult } from "@/types";

const defaultListConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 5_000,
  keepPreviousData: true,
};

const defaultOneConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 10_000,
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
