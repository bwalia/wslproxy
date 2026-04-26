/* ──────────────────────────────────────────────────────────────────────────
   Server-side dashboard fetchers.

   Each section of the dashboard has its own fetcher so it can stream
   independently via a Suspense boundary + be cached under its own
   tag for surgical revalidation.  Called from async Server Components
   in `app/(dashboard)/page.tsx` and friends.

   Why the wrapping try/catch pattern: the backend returns *loose*
   JSON (Lua + Cjson quirks), and a single broken field should not
   nuke the whole dashboard.  Each fetcher returns a typed shape with
   sane empty defaults so downstream components can always render
   *something* — an empty chart is better than a crashed page.
   ────────────────────────────────────────────────────────────────────────── */

import "server-only";
import { serverFetch, CACHE_TAGS } from "@/lib/api/server-client";
import { DASHBOARD_REVALIDATE_SECONDS } from "./constants";
import type {
  AccessLogEntry,
  ErrorLogEntry,
  InstanceInfo,
  SingleResult,
  ListResult,
} from "@/types";

// ─── Shared option factory ──────────────────────────────────────────────
//
// All dashboard fetches share the same caching profile: ISR-style
// revalidation every N seconds + a tag for targeted invalidation.
function dashOpts(tag: string) {
  return {
    next: {
      revalidate: DASHBOARD_REVALIDATE_SECONDS,
      tags: [tag],
    },
  };
}

// Generic "fetch-or-empty" wrapper.  Silences errors + logs to stderr
// so a flaky backend doesn't crash the whole dashboard render.
async function safeFetch<T>(path: string, opts: Parameters<typeof serverFetch>[1], fallback: T): Promise<T> {
  try {
    return (await serverFetch<T>(path, opts)) ?? fallback;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[dashboard fetch] ${path} failed:`, (err as Error).message);
    }
    return fallback;
  }
}

// ─── Traffic (charts, stats cards, geo map) ─────────────────────────────

export interface TrafficData {
  chart_data?: { name: string; requests: number; success?: number; errors: number }[];
  summary?: Record<string, number>;
  top_domains?: { domain: string; requests: number }[];
  error_codes?: { code: number; count: number }[];
  latency?: { fast?: number; normal?: number; slow?: number; very_slow?: number };
  methods?: Record<string, number>;
  geo_data?: { country_code: string; requests: number }[];
}

/**
 * Single fetch that powers 6+ top-of-page widgets: stats cards,
 * traffic time series, top domains, error codes, latency buckets,
 * HTTP methods, geo map.
 */
export async function fetchTrafficData(): Promise<TrafficData> {
  const res = await safeFetch<SingleResult<TrafficData>>(
    "/traffic/stats",
    dashOpts(CACHE_TAGS.dashboardTraffic),
    { data: {} },
  );
  return res?.data ?? {};
}

// ─── Instance info (welcome banner) ─────────────────────────────────────

export async function fetchInstanceInfo(): Promise<InstanceInfo> {
  const res = await safeFetch<SingleResult<InstanceInfo>>(
    "/instance/info",
    dashOpts(CACHE_TAGS.dashboardInstance),
    { data: {} },
  );
  return res?.data ?? {};
}

// ─── Backend health (Backend tab: topology ⨯ health merge) ──────────────

export interface BackendHealthData {
  health: { rule_id: string; backends?: { label?: string; address?: string; healthy?: boolean }[] }[];
  topology: {
    rules_with_backends?: {
      rule_id: string;
      rule_name?: string;
      server_name?: string;
      path?: string;
      routing?: { mode?: string };
      backends?: { label?: string; address?: string; weight?: number }[];
      backend_stats?: Record<string, unknown>;
    }[];
  };
}

/**
 * Parallel fetch of the two endpoints the Backend Health panel needs.
 * Hitting them together cuts the first-paint latency roughly in half
 * vs the legacy dashboard, which issued them sequentially in
 * `useEffect` + `setInterval`.
 */
export async function fetchBackendHealth(): Promise<BackendHealthData> {
  const [healthRes, topoRes] = await Promise.all([
    safeFetch<SingleResult<{ rule_id: string; backends?: BackendHealthData["health"][number]["backends"] }[]>>(
      "/traffic/health",
      dashOpts(CACHE_TAGS.dashboardBackend),
      { data: [] },
    ),
    safeFetch<SingleResult<BackendHealthData["topology"]>>(
      "/traffic/topology",
      dashOpts(CACHE_TAGS.dashboardBackend),
      { data: {} },
    ),
  ]);
  // `??` doesn't catch Lua's empty-table `{}` (it's truthy), so use
  // `Array.isArray` for the array field.  Same pattern as the
  // client-side `getTrafficTopology` / `getTrafficHealth` wrappers
  // in data-provider.ts.
  const healthRaw = healthRes?.data as unknown;
  const topoRaw = topoRes?.data as unknown;
  return {
    health: (Array.isArray(healthRaw)
      ? healthRaw
      : []) as BackendHealthData["health"],
    topology: (topoRaw && typeof topoRaw === "object"
      ? topoRaw
      : {}) as BackendHealthData["topology"],
  };
}

// ─── Cache stats (Cache tab) ────────────────────────────────────────────

export interface CacheStatsData {
  entries?: number;
  size?: number;
  hosts?: number;
  extensions?: number;
  by_host?: { host: string; count: number; size?: number }[];
  by_extension?: { extension: string; count: number; size?: number }[];
  top_urls?: { url: string; size: number; host?: string }[];
}

export async function fetchCacheStats(): Promise<CacheStatsData> {
  const res = await safeFetch<SingleResult<CacheStatsData>>(
    "/cache/stats",
    dashOpts(CACHE_TAGS.dashboardCache),
    { data: {} },
  );
  return res?.data ?? {};
}

// ─── WAF stats (WAF tab) ────────────────────────────────────────────────

export interface WafStatsData {
  ruleCount: number;
  policyCount: number;
  eventCount: number;
  blockedCount: number;
  events: Record<string, unknown>[];
  policies: Record<string, unknown>[];
}

/**
 * Legacy dashboard pulled counts from three list endpoints with
 * `perPage=1` to piggyback on the `total` field — we do the same.
 */
export async function fetchWafStats(): Promise<WafStatsData> {
  type ListMini = ListResult<Record<string, unknown>>;
  const [rulesRes, policiesRes, eventsRes] = await Promise.all([
    safeFetch<ListMini>(
      "/waf_rules?perPage=1",
      dashOpts(CACHE_TAGS.dashboardWaf),
      { data: [], total: 0 },
    ),
    safeFetch<ListMini>(
      "/waf_policies?perPage=1000",
      dashOpts(CACHE_TAGS.dashboardWaf),
      { data: [], total: 0 },
    ),
    safeFetch<ListMini>(
      "/waf_events?perPage=1000",
      dashOpts(CACHE_TAGS.dashboardWaf),
      { data: [], total: 0 },
    ),
  ]);
  const events = eventsRes?.data ?? [];
  const blocked = events.filter(
    (e) => (e as { action?: string }).action === "block",
  );
  return {
    ruleCount: rulesRes?.total ?? 0,
    policyCount: policiesRes?.total ?? (policiesRes?.data?.length ?? 0),
    eventCount: eventsRes?.total ?? events.length,
    blockedCount: blocked.length,
    events,
    policies: policiesRes?.data ?? [],
  };
}

// ─── SSL error metrics (SSL tab) ────────────────────────────────────────

export interface SslMetricsData {
  sni_failures?: number;
  ocsp_failures?: number;
  domain_not_allowed?: number;
  [key: string]: unknown;
}

/**
 * Derived from /logs/metrics aggregator.  The three counts the legacy
 * dashboard shows as separate cards live under these keys; anything
 * else is passed through for future consumers.
 */
export async function fetchSslMetrics(): Promise<SslMetricsData> {
  const res = await safeFetch<SingleResult<SslMetricsData>>(
    "/logs/metrics",
    dashOpts(CACHE_TAGS.dashboardSsl),
    { data: {} },
  );
  return res?.data ?? {};
}

// ─── Entity counts (bottom strip) ───────────────────────────────────────

export interface EntityCounts {
  servers: number;
  rules: number;
  users: number;
  profiles: number;
}

export async function fetchEntityCounts(): Promise<EntityCounts> {
  type ListMini = ListResult<unknown>;
  const [servers, rules, users, profiles] = await Promise.all([
    safeFetch<ListMini>(
      "/servers?perPage=1",
      dashOpts(CACHE_TAGS.dashboardEntities),
      { data: [], total: 0 },
    ),
    safeFetch<ListMini>(
      "/rules?perPage=1",
      dashOpts(CACHE_TAGS.dashboardEntities),
      { data: [], total: 0 },
    ),
    safeFetch<ListMini>(
      "/users?perPage=1",
      dashOpts(CACHE_TAGS.dashboardEntities),
      { data: [], total: 0 },
    ),
    safeFetch<ListMini>(
      "/profiles?perPage=1",
      dashOpts(CACHE_TAGS.dashboardEntities),
      { data: [], total: 0 },
    ),
  ]);
  return {
    servers: servers?.total ?? 0,
    rules: rules?.total ?? 0,
    users: users?.total ?? 0,
    profiles: profiles?.total ?? 0,
  };
}

// ─── Recent logs (LogsSection, AiInsightsWidget seed data) ──────────────

export async function fetchRecentErrorLogs(limit = 100): Promise<ErrorLogEntry[]> {
  const res = await safeFetch<ListResult<ErrorLogEntry>>(
    `/logs/errors?limit=${limit}`,
    dashOpts(CACHE_TAGS.dashboardTraffic),
    { data: [], total: 0 },
  );
  return res?.data ?? [];
}

export async function fetchRecentAccessLogs(limit = 100): Promise<AccessLogEntry[]> {
  const res = await safeFetch<ListResult<AccessLogEntry>>(
    `/logs/access?limit=${limit}`,
    dashOpts(CACHE_TAGS.dashboardTraffic),
    { data: [], total: 0 },
  );
  return res?.data ?? [];
}
