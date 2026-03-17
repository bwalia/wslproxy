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
  rules?: string;
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

// ── Health / system ─────────────────────────────────────────────────────

export interface HealthData {
  status?: string;
  openresty_version?: string;
  nginx_workers?: number;
  redis?: { status?: string; endpoint?: string };
  data_directories?: {
    path: string;
    exists: boolean;
    readable: boolean;
    writable: boolean;
  }[];
  settings_check?: {
    exists: boolean;
    valid_json: boolean;
    status: string;
    error?: string;
    missing_keys?: string[];
  };
  frontend_env?: { status: string; variables?: Record<string, string>; missing?: string[] };
  backend_env?: Record<string, string>;
  system?: {
    hostname?: string;
    fqdn?: string;
    os?: string;
    kernel?: string;
    uptime?: string;
    load_average?: string;
    cpu?: { model?: string; cores?: number; usage_percent?: number };
    memory?: { total?: string; used?: string; available?: string; free?: string };
    disk?: { total?: string; used?: string; available?: string; percent?: string; status?: string };
    ip_addresses?: string[];
  };
  cache_stats?: {
    available: boolean;
    total_entries?: number;
    total_size_bytes?: number;
    dict_capacity?: string;
    dict_free_space?: string;
  };
  network?: { ip_addresses?: string[]; dns?: { primary?: string; secondary?: string; port?: string } };
  build?: Record<string, string>;
  _api_url?: string;
  _http_status?: number;
  _latency?: number;
  _authenticated?: boolean;
}

export interface TrafficStats {
  chart_data?: unknown[];
  summary?: Record<string, unknown>;
}

export interface InstanceInfo {
  hostname?: string;
  fqdn?: string;
  ip_addresses?: string[];
  os?: string;
  kernel?: string;
  cpu?: { model?: string; cores?: number; usage_percent?: number };
  memory?: { total?: string; used?: string; available?: string };
  disk?: { total?: string; used?: string; available?: string; percent?: string };
  load_average?: string;
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
  getLogs(): Promise<SingleResult>;

  // Monitoring
  getInstanceInfo(): Promise<SingleResult<InstanceInfo>>;
  getDetailedHealth(): Promise<SingleResult<HealthData>>;
  checkORStatus(): Promise<SingleResult>;
  getTrafficTopology(): Promise<SingleResult>;
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
}
