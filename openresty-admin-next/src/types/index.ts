/* ──────────────────────────────────────────────────────────────────────────
   Shared TypeScript types for the WSLProxy admin dashboard.
   ────────────────────────────────────────────────────────────────────────── */

// ── API primitives ──────────────────────────────────────────────────────

export interface ListParams {
  pagination?: { page: number; perPage: number };
  sort?: { field: string; order: "ASC" | "DESC" };
  filter?: Record<string, unknown>;
  timestamp?: number;
}

export interface ListResult<T = unknown> {
  data: T[];
  total: number;
}

export interface SingleResult<T = unknown> {
  data: T;
}

// ── Auth ────────────────────────────────────────────────────────────────

export interface AuthToken {
  accessToken: string;
  expiryDate: number;
}

export interface LoginResponse {
  data: {
    accessToken?: string;
    token?: string;
    instance?: Record<string, unknown>;
  };
}

// ── Resources ───────────────────────────────────────────────────────────

export interface Server {
  id: string;
  server_name: string;
  profile_id: string;
  listens?: { listen: string | number }[];
  config?: string;
  config_status?: boolean;
  ssl_enabled?: boolean;
  ssl_email?: string;
  ssl_auto_renew?: boolean;
  ssl_force_https?: boolean;
  ssl_staging?: boolean;
  cache_enabled?: boolean;
  cache_ttl?: number;
  cached_extensions?: string[];
  cached_mime_types?: string[];
  cache_bypass_cookie?: string;
  waf_enabled?: boolean;
  waf_policy_id?: string;
  waf_mode_override?: string;
  rate_limit_enabled?: boolean;
  rate_limit_requests?: number;
  rate_limit_window?: number;
  rate_limit_key?: string;
  proxy_pass?: string;
  proxy_server_name?: string;
  root?: string;
  index?: string;
  access_log?: string;
  error_log?: string;
  rules?: string[];
  match_cases?: { statement: string; condition: string }[];
  locations?: LocationBlock[];
  custom_headers?: { header_key: string; header_value: string }[];
  custom_response_headers?: { header_key: string; header_value: string }[];
  custom_block?: { additional_block: string }[];
  custom_location_block?: { additional_location_block: string }[];
  custom_http_block?: { additional_http_block: string }[];
  varnish_enabled?: boolean;
  nginx_status?: string;
  nginx_status_check?: string;
  servers_tags?: string[];
  created_at?: number;
}

export interface LocationBlock {
  location_path: string;
  location_vals?: Record<string, string>;
  location_opts?: Record<string, string>;
  location_headers?: Record<string, string>;
}

export interface Rule {
  id: string;
  name: string;
  profile_id: string;
  priority?: number;
  version?: number;
  match?: {
    rules?: {
      path?: string;
      path_key?: string;
      country?: string;
      country_key?: string;
      client_ip?: string;
      client_ip_key?: string;
      jwt_token_validation?: string;
      jwt_token_validation_value?: string;
      jwt_token_validation_key?: string;
      amazon_s3_access_key?: string;
      amazon_s3_secret_key?: string;
      amazon_s3_region?: string;
    };
    response?: {
      code?: number;
      message?: string;
      redirect_uri?: string;
      allow?: boolean;
      strip_path?: boolean;
      auto_redirect_https?: boolean;
      is_consul?: boolean;
      consul_domain_name?: string;
      backends?: Backend[];
      routing?: {
        mode?: string;
        header_name?: string;
        header_value?: string;
        cookie_name?: string;
        sticky?: boolean;
        backends?: Backend[];
      };
    };
  };
  servers?: string[];
  rules_tags?: string[];
  created_at?: number;
}

export interface Backend {
  address: string;
  weight: number;
  label: string;
}

export interface Upstream {
  id: string;
  name: string;
  profile_id: string;
  enabled?: boolean;
  load_balancing_method?: string;
  hash_key?: string;
  servers?: UpstreamServer[];
  keepalive?: number;
  keepalive_timeout?: string;
  keepalive_requests?: number;
  health_check_enabled?: boolean;
  health_check_interval?: string;
  health_check_uri?: string;
  health_check_fails?: number;
  health_check_passes?: number;
  zone_name?: string;
  zone_size?: string;
  generated_config?: string;
  created_at?: number;
  updated_at?: number;
}

export interface UpstreamServer {
  address: string;
  port?: number;
  weight?: number;
  max_fails?: number;
  fail_timeout?: string;
  state?: "active" | "backup" | "down";
  slow_start?: string;
  max_conns?: number;
  resolve?: boolean;
}

export interface Secret {
  id: string;
  secret_name: string;
  description?: string;
  profile_id: string;
  secrets?: { key: string; value: string }[];
  secrets_tags?: string[];
  created_at?: number;
}

export interface Instance {
  id: string;
  instance_name: string;
  host_ip?: string;
  host_port?: string;
  host_type?: string;
  instance_status?: boolean;
  instance_hash?: string;
  serial_number?: string;
  instances_tags?: string[];
  created_at?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  website?: string;
  password?: string;
  user_role?: string;
  company?: { name?: string; bs?: string };
  address?: {
    city?: string;
    street?: string;
    suite?: string;
    zipcode?: string;
  };
  created_at?: number;
}

export interface Profile {
  id: string;
  name: string;
  description?: string;
  created_at?: number;
}

export interface Bookmark {
  id: string;
  title: string;
  host?: string;
  url?: string;
  category?: string;
  tags?: string[];
  description?: string;
  profile_id?: string;
  proxy_pass?: string;
  ssl_enabled?: boolean;
  auto_generated?: boolean;
  created_at?: number;
  /** When true, the bookmark is exposed at the public, unauthenticated
   *  /links page (and via GET /api/public/bookmarks).  Defaults to false
   *  so newly-saved records are never accidentally exposed. */
  public?: boolean;
}

export interface WafRule {
  id: string;
  name: string;
  category?: string;
  severity?: string;
  pattern?: string;
  pattern_type?: string;
  target?: string;
  action?: string;
  score?: number;
  enabled?: boolean;
  description?: string;
  created_at?: number;
  updated_at?: number;
}

export interface WafPolicy {
  id: string;
  name: string;
  mode?: string;
  enabled?: boolean;
  description?: string;
  anomaly_threshold?: number;
  paranoia_level?: number;
  body_inspection?: boolean;
  max_body_size?: number;
  waf_rules?: string[];
  created_at?: number;
  updated_at?: number;
}

export interface ChangeRequest {
  id: string;
  state: string;
  resource_name: string;
  resource_type: string;
  profile?: string;
  version?: number;
  change_type?: string;
  created_by?: string;
  description?: string;
  required_approvals?: number;
  approvals?: { user: string; time: string; comment?: string }[];
  rejections?: { user: string; time: string; reason?: string }[];
  created_at?: number;
}

export interface Session {
  id: string;
  session_id?: string;
  subject?: string;
  timeout?: number;
  created_at?: number;
  expires_at?: number;
}

// ── Audit ───────────────────────────────────────────────────────────────

/** Audit log entry.  Written by the backend on every mutation. */
export interface AuditEntry {
  timestamp: number; // unix epoch seconds
  user?: string;
  action?: string; // "create" | "update" | "delete" | custom
  resource_type?: string; // "servers" | "rules" | "upstreams" | …
  resource_name?: string;
  actor?: string;
  actor_ip?: string;
  profile_id?: string;
  diff?: unknown;
  [extra: string]: unknown;
}

export interface AuditFilters {
  date_from?: number;
  date_to?: number;
  user?: string;
  action?: string;
  resource_type?: string;
  resource_name?: string;
  limit?: number;
  offset?: number;
}

// ── WAF events ──────────────────────────────────────────────────────────

/** WAF event emitted when a rule matches. */
export interface WafEvent {
  id?: string;
  timestamp?: number;
  host?: string;
  client_ip?: string;
  method?: string;
  uri?: string;
  rule_id?: string;
  rule_name?: string;
  category?: string;
  severity?: string; // "critical" | "high" | "medium" | "low"
  action?: string; // "block" | "monitor"
  score?: number;
  message?: string;
  [extra: string]: unknown;
}

// ── Health / system ─────────────────────────────────────────────────────

/**
 * Response shape for `GET /api/ping?detailed=true` — defined by
 * api/ping.lua.  Every field is optional because the backend can
 * degrade gracefully and return partial data.  The `health` page
 * renders whichever fields are present.
 */
export interface HealthData {
  status?: "healthy" | "degraded" | "unhealthy" | "unreachable" | string;
  response?: string;
  timestamp?: string;

  services?: {
    openresty?: { status?: string; version?: string };
    nginx_workers?: { status?: string; worker_count?: number };
    redis?: {
      status?: "ok" | "error" | "skipped" | string;
      message?: string;
      host?: string;
      port?: number;
    };
  };

  /**
   * Keyed by absolute directory path — e.g.
   * `{ "data/servers/prod": { exists, readable, writable } }`.
   * Ordering is not guaranteed.
   */
  data_directories?: Record<
    string,
    { exists?: boolean; readable?: boolean; writable?: boolean }
  >;

  settings?: {
    status?: "ok" | "warning" | "error" | string;
    file_exists?: boolean;
    valid_json?: boolean;
    missing_keys?: string[];
    env_profile?: string;
    storage_type?: string;
    error?: string;
  };

  frontend_env?: {
    status?: string;
    file_exists?: boolean;
    env_path?: string;
    variables?: Record<string, string>;
    missing?: string[];
    note?: string;
  };

  environment?: {
    backend?: Record<string, string>;
    frontend?: Record<string, string>;
  };

  system?: {
    app?: string;
    version?: string;
    hostname?: string;
    openresty_version?: string;
    storage_type?: string;
    env_profile?: string;
    deployment_time?: string;
    uptime?: string;
    swagger_url?: string;
    cpu?: {
      cores?: string | number;
      system_usage_percent?: string | number;
    };
    nginx?: {
      worker_count?: number;
      worker_processes_conf?: string;
      worker_connections?: string | number;
      worker_rlimit_nofile?: string | number | null;
      open_files_limit?: string | number;
      memory_rss_mb?: string | number;
      memory_vsz_mb?: string | number;
      memory_percent?: string | number;
    };
  };
}

/**
 * Everything the Health page needs in one bundle, so fetchers stay in
 * one place and the page component receives a single, already-merged
 * prop shape.  `meta` is populated by the server-side fetcher itself
 * (the Lua ping endpoint doesn't report its own URL / HTTP status).
 */
export interface HealthBundle {
  health: HealthData;
  instance: InstanceInfo;
  cache: {
    available?: boolean;
    total_entries?: number;
    total_size_bytes?: number;
    dict_capacity?: string | number;
    dict_free_space?: string | number;
    [key: string]: unknown;
  };
  meta: {
    api_url: string;
    http_status: number;
    latency_ms: number;
    authenticated: boolean;
    /** Error string when the ping call itself failed. */
    error?: string;
  };
}

export interface TrafficStats {
  chart_data?: unknown[];
  summary?: Record<string, unknown>;
}

export interface InstanceInfo {
  hostname?: string;
  fqdn?: string;
  environment?: string;
  uptime?: string;
  ip_addresses?: string[];
  os?: string;
  kernel?: string;
  cpu?: { model?: string; cores?: number; usage_percent?: number };
  memory?: {
    total?: string;
    used?: string;
    available?: string;
    free?: string;
  };
  disk?: { total?: string; used?: string; available?: string; percent?: string };
  load_average?: string;
  network?: {
    interfaces?: string[];
    routes?: string[];
  };
}

// ── Logs & AI Troubleshooting ────────────────────────────────────────────

export interface AccessLogEntry {
  id: string;
  // The Lua backend emits the ISO timestamp under the field name
  // `time` (matching nginx's `$time_iso8601` variable), but earlier
  // versions of this UI assumed `timestamp`.  Both are declared so a
  // renderer that does `log.time ?? log.timestamp` works against any
  // payload shape — older bundles + the JSON nginx log format.
  time?: string;
  timestamp?: string;
  remote_addr: string;
  method: string;
  uri: string;
  status: number;
  body_bytes_sent: number;
  request_time: number;
  // Some upstream lines also use the shorter alias `upstream`.
  upstream?: string;
  upstream_addr?: string;
  upstream_status?: number;
  upstream_response_time?: number;
  http_referer?: string;
  http_user_agent?: string;
  server_name?: string;
  request_id?: string;
  country_code?: string;
  rule_id?: string;
  waf_blocked?: boolean;
  cache_status?: string;
}

export interface ErrorLogEntry {
  id: string;
  // Same shape ambiguity as `AccessLogEntry` — backend emits `time`
  // in some pipelines and `timestamp` in others.  Renderer uses
  // `logTime(log)` to pick whichever is present.
  time?: string;
  timestamp?: string;
  level: "emerg" | "alert" | "crit" | "error" | "warn" | "notice" | "info" | "debug";
  message: string;
  client?: string;
  server?: string;
  request?: string;
  upstream?: string;
  host?: string;
}

export interface LogFilters {
  status_code?: string;
  method?: string;
  path?: string;
  server_name?: string;
  time_range?: string;
  level?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AIAnalysisRequest {
  logs: (AccessLogEntry | ErrorLogEntry)[];
  context?: string;
  question?: string;
}

export interface AIAnalysisResponse {
  analysis: string;
  root_causes?: string[];
  recommendations?: string[];
  severity?: "low" | "medium" | "high" | "critical";
  related_patterns?: string[];
}

/**
 * Result envelope returned by `GET /api/logs/search`.  Matches the
 * shape produced by `Helper.searchLogFile` in `api/helpers.lua`.
 *
 *  - `matches` — newest-first up to the requested `limit`.
 *  - `lineno` is relative to the scanned window, NOT the full file;
 *    check `truncated` to know if older lines were skipped.
 *  - `scanned_bytes` / `total_lines_scanned` are useful for the
 *    "Showing X of Y" status bar in the viewer.
 */
export interface LogSearchMatch {
  lineno: number;
  text: string;
}

export interface LogSearchResult {
  matches: LogSearchMatch[];
  scanned_bytes: number;
  total_lines_scanned: number;
  truncated: boolean;
}

export interface BackendHealthDetail {
  rule_id: string;
  rule_name: string;
  server_name: string;
  path: string;
  backend_label: string;
  address: string;
  healthy: boolean;
  weight: number;
  requests: number;
  errors: number;
  avg_latency_ms: number;
  error_rate: number;
  p95_latency_ms?: number;
  p99_latency_ms?: number;
  last_check?: string;
  consecutive_failures?: number;
  status_codes?: Record<string, number>;
}

// ── Settings ────────────────────────────────────────────────────────────

export interface AppSettings {
  instance_id?: string;
  instance_name?: string;
  env_profile?: string;
  storage_type?: string;
  env_vars?: Record<string, string>;
  [key: string]: unknown;
}

// ── Data provider interface ─────────────────────────────────────────────

export interface DataProvider {
  getList<T = unknown>(resource: string, params?: ListParams): Promise<ListResult<T>>;
  getOne<T = unknown>(resource: string, id: string): Promise<SingleResult<T>>;
  create<T = unknown>(resource: string, data: Record<string, unknown>): Promise<SingleResult<T>>;
  update<T = unknown>(resource: string, id: string, data: Record<string, unknown>): Promise<SingleResult<T>>;
  remove(resource: string, id: string, body?: unknown): Promise<unknown>;
  removeMany(resource: string, ids: string[]): Promise<unknown>;

  // Analytics
  getTrafficStats(): Promise<SingleResult<TrafficStats>>;
  getErrorDetails(statusCode?: string): Promise<SingleResult>;
  getLogMetrics(): Promise<SingleResult>;
  getCacheStats(): Promise<SingleResult>;
  getLogs(resource?: string): Promise<SingleResult>;
  searchLogs(params: {
    kind: "error" | "access";
    q?: string;
    regex?: boolean;
    caseSensitive?: boolean;
    limit?: number;
    maxBytes?: number;
  }): Promise<SingleResult<LogSearchResult>>;

  // Monitoring
  getInstanceInfo(): Promise<SingleResult<InstanceInfo>>;
  getDetailedHealth(): Promise<SingleResult<HealthData>>;
  checkORStatus(): Promise<SingleResult>;
  getTrafficTopology(): Promise<SingleResult>;
  getTopologyGraph(profileId?: string): Promise<SingleResult>;
  getTrafficBackendStats(ruleId: string): Promise<SingleResult>;
  getTrafficHealth(): Promise<SingleResult>;

  // Traffic management
  updateTrafficWeights(data: unknown): Promise<SingleResult>;
  promoteBackend(data: unknown): Promise<SingleResult>;
  rollbackBackend(data: unknown): Promise<SingleResult>;

  // Special
  loadSettings(): Promise<AppSettings | null>;
  saveStorageFlag(resource: string, data: unknown): Promise<SingleResult>;
  profileUpdate(data: unknown): Promise<SingleResult>;
  importProjects(data: unknown): Promise<SingleResult>;
  resetPassword(data: unknown): Promise<SingleResult>;
  pushDataServers(resource: string, data: unknown): Promise<SingleResult>;
  syncAPI(): Promise<void>;

  // Change requests
  getChangeRequests(params?: ListParams): Promise<ListResult<ChangeRequest>>;
  getPendingCRCount(): Promise<{ count: number }>;
  getCRConfig(): Promise<SingleResult>;
  approveCR(id: string, data: unknown): Promise<SingleResult>;
  rejectCR(id: string, data: unknown): Promise<SingleResult>;
  setCRPassphrase(data: unknown): Promise<SingleResult>;

  // Logs & AI troubleshooting
  getAccessLogs(filters?: LogFilters): Promise<ListResult<AccessLogEntry>>;
  getErrorLogs(filters?: LogFilters): Promise<ListResult<ErrorLogEntry>>;
  getBackendHealthDetails(): Promise<ListResult<BackendHealthDetail>>;
  analyzeWithAI(request: AIAnalysisRequest): Promise<SingleResult<AIAnalysisResponse>>;
  getAIModels(): Promise<SingleResult<{ models: string[]; default: string }>>;

  // Cache management
  /** Purge cache for a specific server (`POST /api/cache/clear/{server}`). */
  purgeCache(serverName: string): Promise<SingleResult>;
  /** Purge ALL cached content (`POST /api/cache/clear-all`). */
  purgeAllCache(): Promise<SingleResult>;

  // Version history
  /** List stored versions for a resource.
   *  `GET /api/versions/{type}/{profile}/{name}`. */
  listVersions(
    resourceType: string,
    profile: string,
    resourceName: string,
  ): Promise<ListResult<StoredVersion>>;
  /**
   * Create a new draft version cloned from a historical version.
   * `POST /api/versions/{type}/{profile}/{name}/rollback/{version}`.
   */
  rollbackVersion(
    resourceType: string,
    profile: string,
    resourceName: string,
    version: number,
  ): Promise<SingleResult>;
}

/** Backend representation of a stored version. */
export interface StoredVersion {
  version: number;
  state?: "draft" | "pending" | "live" | "archived" | string;
  created_at?: number;
  created_by?: string;
  description?: string;
  config?: unknown;
  [extra: string]: unknown;
}
