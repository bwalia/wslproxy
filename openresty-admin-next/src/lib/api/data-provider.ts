/* ──────────────────────────────────────────────────────────────────────────
   Data-provider — the single gateway between UI and the WSLProxy Lua API.
   Pure functions, no React hooks.  Use `useResource` / `useApi` in components.
   ────────────────────────────────────────────────────────────────────────── */

import type {
  AppSettings,
  ChangeRequest,
  DataProvider,
  HealthData,
  InstanceInfo,
  ListParams,
  ListResult,
  SingleResult,
  TrafficStats,
} from "@/types";
import { apiFetch, encodePayload } from "./client";

// ── Helpers ─────────────────────────────────────────────────────────────

function getEnvProfile(): string {
  if (typeof window === "undefined") return "prod";
  return localStorage.getItem("environment") || "prod";
}

function listUrl(resource: string, params: ListParams = {}): string {
  const merged = {
    pagination: params.pagination ?? { page: 1, perPage: 1000 },
    sort: params.sort ?? { field: "id", order: "ASC" },
    filter: {
      ...params.filter,
      profile_id: (params.filter?.profile_id as string) || getEnvProfile(),
    },
    timestamp: Date.now(),
  };
  return `/${resource}?_format=json&params=${encodeURIComponent(JSON.stringify(merged))}`;
}

function oneUrl(resource: string, id: string): string {
  return `/${resource}/${id}?_format=json&envprofile=${getEnvProfile()}&timestamp=${Date.now()}`;
}

function ts(): string {
  return `timestamp=${Date.now()}`;
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
    apiFetch<ListResult<T>>(listUrl(resource, params))
      .then((r) => {
        if (!r) return { data: [] as T[], total: 0 };
        return {
          data: Array.isArray(r.data) ? r.data : [],
          total: r.total ?? 0,
        } as ListResult<T>;
      })
      .catch(() => ({ data: [] as T[], total: 0 })),

  getOne: <T>(resource: string, id: string) =>
    apiFetch<SingleResult<T>>(oneUrl(resource, id)),

  create: <T>(resource: string, data: Record<string, unknown>) => {
    const payload = resource === "servers" ? handleConfigField(data) : data;
    return apiFetch<SingleResult<T>>(`/${resource}`, {
      method: "POST",
      body: encodePayload(payload),
    });
  },

  update: <T>(resource: string, id: string, data: Record<string, unknown>) => {
    let payload = resource === "servers" ? handleConfigField(data) : { ...data };
    const env = getEnvProfile();
    if (env && (payload as Record<string, unknown>).profile_id !== env) {
      (payload as Record<string, unknown>).profile_id = env;
    }
    return apiFetch<SingleResult<T>>(`/${resource}/${id}?${ts()}`, {
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
    apiFetch<SingleResult<TrafficStats>>(`/traffic/stats?${ts()}`).then(
      (r) => r ?? ({ data: { chart_data: [], summary: {} } } as SingleResult<TrafficStats>),
    ),

  getErrorDetails: (statusCode?: string) =>
    apiFetch<SingleResult>(
      statusCode ? `/traffic/errors/${statusCode}?${ts()}` : `/traffic/errors?${ts()}`,
    ).then((r) => r ?? { data: {} }),

  getLogMetrics: () =>
    apiFetch<SingleResult>(`/log/metrics?${ts()}`).then((r) => r ?? { data: { available: false } }),

  getCacheStats: () =>
    apiFetch<SingleResult>(`/cache/stats?${ts()}`).then((r) => r ?? { data: { available: false } }),

  getLogs: () =>
    apiFetch<SingleResult>(`/openresty/error_logs?${ts()}`).then((r) => r ?? { data: {} }),

  // ── Monitoring ────────────────────────────────────────────────────

  getInstanceInfo: () =>
    apiFetch<SingleResult<InstanceInfo>>(`/instance/info?${ts()}`).then(
      (r) => r ?? ({ data: {} } as SingleResult<InstanceInfo>),
    ),

  getDetailedHealth: async () => {
    const start = Date.now();
    try {
      const r = await apiFetch<SingleResult<Record<string, unknown>>>(`/ping?detailed=true&${ts()}`);
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
    apiFetch<SingleResult>(`/openresty_status?${ts()}`).then((r) => r ?? { data: {} }),

  getTrafficTopology: () =>
    apiFetch<SingleResult>(`/traffic/topology?${ts()}`).then(
      (r) => r ?? { data: { servers: [], rules_with_backends: [], connections: [] } },
    ),

  getTopologyGraph: (profileId?: string) =>
    apiFetch<SingleResult>(
      `/topology/graph?profile_id=${profileId || getEnvProfile()}&${ts()}`,
    ).then((r) => r ?? { data: { nodes: [], edges: [], summary: {} } }),

  getTrafficBackendStats: (ruleId: string) =>
    apiFetch<SingleResult>(`/traffic/backends?rule_id=${encodeURIComponent(ruleId)}&${ts()}`).then(
      (r) => r ?? { data: { rule_id: ruleId, backends: [] } },
    ),

  getTrafficHealth: () =>
    apiFetch<SingleResult>(`/traffic/health?${ts()}`).then((r) => r ?? { data: [] }),

  // ── Traffic management ────────────────────────────────────────────

  updateTrafficWeights: (data) =>
    apiFetch(`/traffic/backends/weights`, { method: "POST", body: JSON.stringify(data) }),

  promoteBackend: (data) =>
    apiFetch(`/traffic/backends/promote`, { method: "POST", body: JSON.stringify(data) }),

  rollbackBackend: (data) =>
    apiFetch(`/traffic/backends/rollback`, { method: "POST", body: JSON.stringify(data) }),

  // ── Special ───────────────────────────────────────────────────────

  loadSettings: async () => {
    const r = await apiFetch<{ data?: AppSettings } | null>(`/global/settings?${ts()}`);
    return r?.data ?? null;
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
    const frontUrl = typeof window !== "undefined"
      ? localStorage.getItem("FRONT_URL") ?? ""
      : "";
    if (!frontUrl) return;
    const instanceRaw = localStorage.getItem("instance");
    if (!instanceRaw) return;
    const instance = JSON.parse(instanceRaw);
    const env = getEnvProfile();
    await fetch(
      `${frontUrl}/frontdoor/opsapi/sync?envprofile=${env}&settings=true&instance_hash=${instance.instance_hash}&serial_number=${instance.serial_number}`,
    );
  },

  // ── Change requests ───────────────────────────────────────────────

  getChangeRequests: (params = {}) =>
    apiFetch<ListResult<ChangeRequest>>(`/change-requests?${ts()}&params=${encodeURIComponent(JSON.stringify(params))}`).then(
      (r) => r ?? { data: [], total: 0 },
    ),

  getPendingCRCount: () =>
    apiFetch<{ count: number }>(`/change-requests/pending-count?${ts()}`).then(
      (r) => r ?? { count: 0 },
    ),

  getCRConfig: () =>
    apiFetch<SingleResult>(`/change-requests/config?${ts()}`).then((r) => r ?? { data: {} }),

  approveCR: (id, data) =>
    apiFetch(`/change-requests/${id}/approve`, { method: "PUT", body: JSON.stringify(data) }),

  rejectCR: (id, data) =>
    apiFetch(`/change-requests/${id}/reject`, { method: "PUT", body: JSON.stringify(data) }),

  setCRPassphrase: (data) =>
    apiFetch(`/change-requests/config/passphrase`, { method: "PUT", body: JSON.stringify(data) }),
};
