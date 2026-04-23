/* ──────────────────────────────────────────────────────────────────────────
   Data-provider — the single gateway between UI and the WSLProxy Lua API.
   Pure functions, no React hooks.  Use `useResource` / `useApi` in components.
   ────────────────────────────────────────────────────────────────────────── */

import type {
  AccessLogEntry,
  AIAnalysisRequest,
  AIAnalysisResponse,
  AppSettings,
  BackendHealthDetail,
  ChangeRequest,
  DataProvider,
  ErrorLogEntry,
  HealthData,
  InstanceInfo,
  ListParams,
  ListResult,
  LogFilters,
  SingleResult,
  StoredVersion,
  TrafficStats,
} from "@/types";
import type { ZodTypeAny } from "zod";
import { apiFetch, encodePayload } from "./client";
import { STORAGE_KEYS, get, getWithDefault } from "@/lib/storage";
import { validate } from "@/lib/validation/validate";
import {
  serverSchema,
  ruleSchema,
  upstreamSchema,
  appSettingsSchema,
  auditEntrySchema,
  wafEventSchema,
  sessionSchema,
  listResultSchema,
  singleResultSchema,
} from "@/lib/validation/schemas";

// Map resource name → Zod schema for per-item validation on list/one.
// Resources not listed pass through without validation (backward-compat).
const RESOURCE_SCHEMAS: Record<string, ZodTypeAny | undefined> = {
  servers: serverSchema,
  rules: ruleSchema,
  upstreams: upstreamSchema,
  audit: auditEntrySchema,
  waf_events: wafEventSchema,
  sessions: sessionSchema,
};

// Tolerant by default so payload drift doesn't break the UI; failures
// log to console in dev.  Flip to `false` once schemas are stable.
const VALIDATE_TOLERANT = true;

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Active environment profile.  Reads the namespaced key through the
 * typed storage layer; falls back to the legacy unnamespaced key for
 * users whose localStorage hasn't migrated yet (ProfileContext's
 * hydrate step migrates them on next mount).
 */
function getEnvProfile(): string {
  const ns = get(STORAGE_KEYS.environment);
  if (ns) return ns;
  // Transitional fallback — ProfileContext migrates this on next render.
  if (typeof window !== "undefined") {
    try {
      const legacy = window.localStorage.getItem("environment");
      if (legacy && legacy.trim()) return legacy.replace(/^"|"$/g, "");
    } catch {
      /* non-fatal */
    }
  }
  return "prod";
}

function listUrl(resource: string, params: ListParams = {}): string {
  // NOTE: No timestamp in the URL — we rely on `cache: "no-store"` at the
  // fetch layer and SWR's dedupingInterval for client-side caching.  A
  // stable URL is required for SWR deduplication to work.
  const merged = {
    pagination: params.pagination ?? { page: 1, perPage: 1000 },
    sort: params.sort ?? { field: "id", order: "ASC" },
    filter: {
      ...params.filter,
      profile_id: (params.filter?.profile_id as string) || getEnvProfile(),
    },
  };
  return `/${resource}?_format=json&params=${encodeURIComponent(JSON.stringify(merged))}`;
}

function oneUrl(resource: string, id: string): string {
  return `/${resource}/${id}?_format=json&envprofile=${getEnvProfile()}`;
}

// ── Nginx server config builder (same logic as old dashboard) ───────────

function generateSslBlock(d: Record<string, unknown>): string {
  if (!d.ssl_enabled) return "";
  return `
      listen 443 ssl http2;
      ssl_certificate_by_lua_block { auto_ssl:ssl_certificate() }
      ssl_certificate /etc/ssl/resty-auto-ssl-fallback.crt;
      ssl_certificate_key /etc/ssl/resty-auto-ssl-fallback.key;
      ssl_session_timeout 1d;
      ssl_session_cache shared:SSL:50m;
      ssl_session_tickets off;
      ssl_protocols TLSv1.2 TLSv1.3;
      ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
      ssl_prefer_server_ciphers off;
      add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`;
}

function generateAcmeBlock(d: Record<string, unknown>): string {
  if (!d.ssl_enabled) return "";
  return `
      location /.well-known/acme-challenge/ {
          content_by_lua_block { auto_ssl:challenge_server() }
      }`;
}

function generateRedirectBlock(d: Record<string, unknown>): string {
  if (!d.ssl_enabled || !d.ssl_force_https) return "";
  const name = (d.server_name as string) || "example.com";
  return `
server {
    listen 80;
    server_name ${name};
    location /.well-known/acme-challenge/ { content_by_lua_block { auto_ssl:challenge_server() } }
    location / { return 301 https://$host$request_uri; }
}
`;
}

function handleConfigField(data: Record<string, unknown>): Record<string, unknown> {
  const d = { ...data };
  const listens = (d.listens as { listen?: string }[]) ?? [];
  const locations = (d.locations as Record<string, unknown>[]) ?? [];
  const customBlocks = (d.custom_block as { additional_block: string }[]) ?? [];
  const customLocBlocks = (d.custom_location_block as { additional_location_block: string }[]) ?? [];
  const customHttpBlocks = (d.custom_http_block as { additional_http_block: string }[]) ?? [];

  d.config = `${generateRedirectBlock(d)}server {
      ${listens.map((l) => `listen ${l.listen || ""};`).join("\n")}
      ${generateSslBlock(d)}
      server_name ${d.server_name || "example.com"};
      root ${d.root || "/var/www/html"};
      index ${d.index || "index.html index.htm"};
      access_log ${d.access_log || "/var/log/nginx/access.log"};
      error_log ${d.error_log || "/var/log/nginx/error.log"};
      ${generateAcmeBlock(d)}
      ${locations
        .map((loc) => {
          const vals = (loc.location_vals ?? {}) as Record<string, string>;
          const opts = (loc.location_opts ?? {}) as Record<string, string>;
          const inner = Object.values(opts)
            .map((idx) => `${idx} ${vals[idx] ?? ""}`)
            .join("\n");
          return `location ${loc.location_path || "/"} {
                ${inner || "#Please select an Options"}
            ${customLocBlocks.map((b) => b.additional_location_block).join("\n")}
          }`;
        })
        .join("\n")}
      ${customBlocks.map((b) => b.additional_block).join("\n")}
  }
  ${customHttpBlocks.map((b) => b.additional_http_block).join("\n")}
  `;
  return d;
}

// ── Data provider singleton ─────────────────────────────────────────────

export const dataProvider: DataProvider = {
  // ── CRUD ───────────────────────────────────────────────────────────

  getList: <T>(resource: string, params: ListParams = {}) =>
    // Errors are intentionally NOT caught here — they propagate to SWR so the
    // UI can show a proper error state with retry, instead of silently showing
    // an empty list and hiding backend failures.
    apiFetch<ListResult<T>>(listUrl(resource, params)).then((r) => {
      if (!r) return { data: [] as T[], total: 0 };
      const schema = RESOURCE_SCHEMAS[resource];
      if (schema) {
        const parsed = validate(listResultSchema(schema), r, {
          path: `GET /${resource}`,
          tolerant: VALIDATE_TOLERANT,
        });
        return {
          data: (parsed.data ?? []) as T[],
          total: parsed.total ?? 0,
        } as ListResult<T>;
      }
      return {
        data: Array.isArray(r.data) ? r.data : [],
        total: r.total ?? 0,
      } as ListResult<T>;
    }),

  getOne: <T>(resource: string, id: string) =>
    apiFetch<SingleResult<T>>(oneUrl(resource, id)).then((r) => {
      if (!r) return { data: null } as SingleResult<T>;
      const schema = RESOURCE_SCHEMAS[resource];
      if (schema) {
        return validate(singleResultSchema(schema), r, {
          path: `GET /${resource}/:id`,
          tolerant: VALIDATE_TOLERANT,
        }) as SingleResult<T>;
      }
      return r;
    }),

  create: <T>(resource: string, data: Record<string, unknown>) => {
    const payload = resource === "servers"
      ? (handleConfigField(data) as Record<string, unknown>)
      : { ...data };
    // Inject profile_id fallback so records are created in the active
    // environment profile.  Mirrors `update` — keeps the list page
    // (which filters by localStorage.environment) and the saved record
    // on the same profile by default, while still honouring an explicit
    // profile_id chosen in the form.
    const env = getEnvProfile();
    if (env && !payload.profile_id) {
      payload.profile_id = env;
    }
    return apiFetch<SingleResult<T>>(`/${resource}`, {
      method: "POST",
      body: encodePayload(payload),
    });
  },

  update: <T>(resource: string, id: string, data: Record<string, unknown>) => {
    const payload = (resource === "servers"
      ? handleConfigField(data)
      : { ...data }) as Record<string, unknown>;
    const env = getEnvProfile();
    // Honour an explicit profile_id from the form; otherwise fall back
    // to the current environment profile.
    if (env && !payload.profile_id) {
      payload.profile_id = env;
    }
    // The Lua backend reads `json_val.id` out of the body (not the URL
    // path) — see api.lua:CreateUpdateRecord.  Always include it so
    // callers don't have to remember to echo the id back.
    if (!payload.id) {
      payload.id = id;
    }
    return apiFetch<SingleResult<T>>(`/${resource}/${id}`, {
      method: "PUT",
      body: encodePayload(payload),
    });
  },

  remove: (resource: string, id: string, body?: unknown) =>
    apiFetch(`/${resource}/${id}`, {
      method: "DELETE",
      body: JSON.stringify(body ?? { envProfile: getEnvProfile(), timestamp: Date.now() }),
    }),

  removeMany: (resource: string, ids: string[]) =>
    apiFetch(`/${resource}`, {
      method: "DELETE",
      body: JSON.stringify({ ids: { ids, envProfile: getEnvProfile(), timestamp: Date.now() } }),
    }),

  // ── Analytics ─────────────────────────────────────────────────────

  getTrafficStats: () =>
    apiFetch<SingleResult<TrafficStats>>(`/traffic/stats`).then(
      (r) => r ?? ({ data: { chart_data: [], summary: {} } } as SingleResult<TrafficStats>),
    ),

  getErrorDetails: (statusCode?: string) =>
    apiFetch<SingleResult>(
      statusCode ? `/traffic/errors/${statusCode}` : `/traffic/errors`,
    ).then((r) => r ?? { data: {} }),

  getLogMetrics: () =>
    apiFetch<SingleResult>(`/log/metrics`).then((r) => r ?? { data: { available: false } }),

  getCacheStats: () =>
    apiFetch<SingleResult>(`/cache/stats`).then((r) => r ?? { data: { available: false } }),

  getLogs: () =>
    apiFetch<SingleResult>(`/openresty/error_logs`).then((r) => r ?? { data: {} }),

  // ── Monitoring ────────────────────────────────────────────────────

  getInstanceInfo: () =>
    apiFetch<SingleResult<InstanceInfo>>(`/instance/info`).then(
      (r) => r ?? ({ data: {} } as SingleResult<InstanceInfo>),
    ),

  getDetailedHealth: async () => {
    const start = Date.now();
    try {
      const r = await apiFetch<SingleResult<Record<string, unknown>>>(`/ping?detailed=true`);
      return {
        data: {
          ...(r?.data ?? {}),
          _http_status: 200,
          _latency: Date.now() - start,
          _authenticated: true,
        },
      } as SingleResult<HealthData>;
    } catch (err) {
      return {
        data: {
          status: "unreachable",
          error: (err as Error).message,
          _http_status: undefined,
          _latency: Date.now() - start,
          _authenticated: false,
        },
      } as SingleResult<HealthData>;
    }
  },

  checkORStatus: () =>
    apiFetch<SingleResult>(`/openresty_status`).then((r) => r ?? { data: {} }),

  getTrafficTopology: () =>
    apiFetch<SingleResult>(`/traffic/topology`).then(
      (r) => r ?? { data: { servers: [], rules_with_backends: [], connections: [] } },
    ),

  getTopologyGraph: (profileId?: string) =>
    apiFetch<SingleResult>(
      `/topology/graph?profile_id=${profileId || getEnvProfile()}`,
    ).then((r) => r ?? { data: { nodes: [], edges: [], summary: {} } }),

  getTrafficBackendStats: (ruleId: string) =>
    apiFetch<SingleResult>(`/traffic/backends?rule_id=${encodeURIComponent(ruleId)}`).then(
      (r) => r ?? { data: { rule_id: ruleId, backends: [] } },
    ),

  getTrafficHealth: () =>
    apiFetch<SingleResult>(`/traffic/health`).then((r) => r ?? { data: [] }),

  // ── Traffic management ────────────────────────────────────────────

  updateTrafficWeights: (data) =>
    apiFetch(`/traffic/backends/weights`, { method: "POST", body: JSON.stringify(data) }),

  promoteBackend: (data) =>
    apiFetch(`/traffic/backends/promote`, { method: "POST", body: JSON.stringify(data) }),

  rollbackBackend: (data) =>
    apiFetch(`/traffic/backends/rollback`, { method: "POST", body: JSON.stringify(data) }),

  // ── Special ───────────────────────────────────────────────────────

  loadSettings: async () => {
    const r = await apiFetch<{ data?: AppSettings } | null>(`/global/settings`);
    if (!r?.data) return null;
    return validate(appSettingsSchema, r.data, {
      path: "GET /global/settings",
      tolerant: VALIDATE_TOLERANT,
    }) as AppSettings;
  },

  saveStorageFlag: (resource, data) =>
    apiFetch(`/${resource}?_format=json`, { method: "POST", body: JSON.stringify(data) }),

  profileUpdate: (data) =>
    apiFetch(`/settings/profile`, { method: "POST", body: JSON.stringify(data) }),

  importProjects: (data) =>
    apiFetch(`/projects/import?_format=json`, { method: "POST", body: JSON.stringify(data) }),

  resetPassword: (data) =>
    apiFetch(`/password/reset`, { method: "POST", body: JSON.stringify(data) }),

  pushDataServers: (resource, data) =>
    apiFetch(`/${resource}`, {
      method: "POST",
      body: JSON.stringify({ ...(data as Record<string, unknown>), profile: getEnvProfile(), timestamp: Date.now() }),
    }),

  syncAPI: async () => {
    const frontUrl = getWithDefault(STORAGE_KEYS.frontUrl, "");
    if (!frontUrl) return;
    const instance = get(STORAGE_KEYS.instance);
    if (!instance?.instance_hash || !instance?.serial_number) return;
    const env = getEnvProfile();
    await fetch(
      `${frontUrl}/frontdoor/opsapi/sync?envprofile=${env}&settings=true&instance_hash=${instance.instance_hash}&serial_number=${instance.serial_number}`,
    );
  },

  // ── Change requests ───────────────────────────────────────────────

  getChangeRequests: (params = {}) =>
    apiFetch<ListResult<ChangeRequest>>(`/change-requests?params=${encodeURIComponent(JSON.stringify(params))}`).then(
      (r) => r ?? { data: [], total: 0 },
    ),

  getPendingCRCount: () =>
    apiFetch<{ count: number }>(`/change-requests/pending-count`).then(
      (r) => r ?? { count: 0 },
    ),

  getCRConfig: () =>
    apiFetch<SingleResult>(`/change-requests/config`).then((r) => r ?? { data: {} }),

  approveCR: (id, data) =>
    apiFetch(`/change-requests/${id}/approve`, { method: "PUT", body: JSON.stringify(data) }),

  rejectCR: (id, data) =>
    apiFetch(`/change-requests/${id}/reject`, { method: "PUT", body: JSON.stringify(data) }),

  setCRPassphrase: (data) =>
    apiFetch(`/change-requests/config/passphrase`, { method: "PUT", body: JSON.stringify(data) }),

  // ── Logs & AI troubleshooting ───────────────────────────────────────

  getAccessLogs: (filters: LogFilters = {}) => {
    const qs = new URLSearchParams();
    if (filters.status_code) qs.set("status_code", filters.status_code);
    if (filters.method) qs.set("method", filters.method);
    if (filters.path) qs.set("path", filters.path);
    if (filters.server_name) qs.set("server_name", filters.server_name);
    if (filters.time_range) qs.set("time_range", filters.time_range);
    if (filters.search) qs.set("search", filters.search);
    if (filters.limit) qs.set("limit", String(filters.limit));
    if (filters.offset) qs.set("offset", String(filters.offset));
    return apiFetch<ListResult<AccessLogEntry>>(`/logs/access?${qs}`).then(
      (r) => r ?? { data: [] as AccessLogEntry[], total: 0 },
    );
  },

  getErrorLogs: (filters: LogFilters = {}) => {
    const qs = new URLSearchParams();
    if (filters.level) qs.set("level", filters.level);
    if (filters.search) qs.set("search", filters.search);
    if (filters.time_range) qs.set("time_range", filters.time_range);
    if (filters.limit) qs.set("limit", String(filters.limit));
    if (filters.offset) qs.set("offset", String(filters.offset));
    return apiFetch<ListResult<ErrorLogEntry>>(`/logs/errors?${qs}`).then(
      (r) => r ?? { data: [] as ErrorLogEntry[], total: 0 },
    );
  },

  getBackendHealthDetails: () =>
    apiFetch<ListResult<BackendHealthDetail>>(`/traffic/health/details`).then(
      (r) => r ?? { data: [] as BackendHealthDetail[], total: 0 },
    ),

  analyzeWithAI: (request: AIAnalysisRequest) =>
    apiFetch<SingleResult<AIAnalysisResponse>>(`/ai/analyze`, {
      method: "POST",
      body: JSON.stringify(request),
    }).then((r) => r ?? { data: { analysis: "Analysis unavailable", root_causes: [], recommendations: [] } }),

  getAIModels: () =>
    apiFetch<SingleResult<{ models: string[]; default: string }>>(`/ai/models`).then(
      (r) => r ?? { data: { models: [], default: "" } },
    ),

  // ── Cache management ──────────────────────────────────────────────

  purgeCache: (serverName) =>
    apiFetch<SingleResult>(`/cache/clear/${encodeURIComponent(serverName)}`, {
      method: "POST",
    }).then((r) => r ?? { data: { message: "Cache purged" } }),

  purgeAllCache: () =>
    apiFetch<SingleResult>(`/cache/clear-all`, { method: "POST" }).then(
      (r) => r ?? { data: { message: "All cache purged" } },
    ),

  // ── Version history ───────────────────────────────────────────────

  listVersions: (resourceType, profile, resourceName) =>
    apiFetch<ListResult<StoredVersion>>(
      `/versions/${encodeURIComponent(resourceType)}/${encodeURIComponent(profile)}/${encodeURIComponent(resourceName)}`,
    ).then(
      (r) => r ?? ({ data: [], total: 0 } as ListResult<StoredVersion>),
    ),

  rollbackVersion: (resourceType, profile, resourceName, version) =>
    apiFetch<SingleResult>(
      `/versions/${encodeURIComponent(resourceType)}/${encodeURIComponent(profile)}/${encodeURIComponent(resourceName)}/rollback/${version}`,
      { method: "POST" },
    ).then((r) => r ?? { data: {} }),
};
