// Resource entity interfaces for WSLProxy admin dashboard

export interface VersionControl {
  live_version?: number;
  draft_version?: number;
  status?: string;
  versions?: VersionEntry[];
}

export interface VersionEntry {
  version: number;
  data?: Record<string, unknown>;
  created_at?: string;
  created_by?: string;
}

export interface ListenEntry {
  listen: string;
}

export interface LocationEntry {
  location_path?: string;
  location_vals?: Record<string, string>;
  location_opts?: Record<string, string>;
}

export interface CustomBlock {
  additional_block?: string;
}

export interface CustomLocationBlock {
  additional_location_block?: string;
}

export interface CustomHttpBlock {
  additional_http_block?: string;
}

export interface Server {
  id: string;
  server_name?: string;
  ssl_enabled?: boolean;
  ssl_force_https?: boolean;
  root?: string;
  index?: string;
  access_log?: string;
  error_log?: string;
  listens?: ListenEntry[];
  locations?: LocationEntry[];
  custom_block?: CustomBlock[];
  custom_location_block?: CustomLocationBlock[];
  custom_http_block?: CustomHttpBlock[];
  config?: string;
  profile_id?: string;
  version_control?: VersionControl;
  tags?: string[];
  cache_enabled?: boolean;
  waf_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MatchCondition {
  field?: string;
  operator?: string;
  value?: string;
}

export interface GeoFilter {
  enabled?: boolean;
  allowed_countries?: string[];
  blocked_countries?: string[];
  default_action?: string;
}

export interface JwtValidation {
  enabled?: boolean;
  secret?: string;
  issuer?: string;
  audience?: string;
  claims?: Record<string, string>;
}

export interface TrafficSplitTarget {
  upstream?: string;
  weight?: number;
}

export interface TrafficSplitting {
  enabled?: boolean;
  targets?: TrafficSplitTarget[];
}

export interface Rule {
  id: string;
  name?: string;
  match_conditions?: MatchCondition[];
  status_code?: number;
  response?: string;
  profile_id?: string;
  version_control?: VersionControl;
  tags?: string[];
  geo_filtering?: GeoFilter;
  jwt_validation?: JwtValidation;
  traffic_splitting?: TrafficSplitting;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  password?: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Profile {
  id: string;
  name?: string;
  description?: string;
  created_at?: string;
}

export interface Secret {
  id: string;
  name?: string;
  value?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Instance {
  id: string;
  name?: string;
  instance_hash?: string;
  serial_number?: string;
  created_at?: string;
}

export interface UpstreamServer {
  address?: string;
  port?: number;
  weight?: number;
  max_fails?: number;
  fail_timeout?: string;
}

export interface Upstream {
  id: string;
  name?: string;
  servers?: UpstreamServer[];
  created_at?: string;
}

export interface WafRule {
  id: string;
  name?: string;
  category?: string;
  severity?: string;
  target?: string;
  action?: string;
  enabled?: boolean;
  score?: number;
  pattern?: string;
  tags?: string[];
}

export interface WafPolicy {
  id: string;
  name?: string;
  mode?: string;
  enabled?: boolean;
  anomaly_threshold?: number;
  paranoia_level?: number;
}

export interface WafEvent {
  id: string;
  timestamp?: string;
  type?: string;
  host?: string;
  rule_name?: string;
  category?: string;
  severity?: string;
  client_ip?: string;
  uri?: string;
  method?: string;
  score?: number;
}

export interface Bookmark {
  id: string;
  name?: string;
  url?: string;
  created_at?: string;
}

export interface Session {
  id: string;
  user_id?: string;
  created_at?: string;
  expires_at?: string;
}

export interface Setting {
  id: string;
  key?: string;
  value?: string;
  storage_type?: string;
}

export interface Approval {
  user?: string;
  approved_at?: string;
}

export interface ChangeRequest {
  id: string;
  status?: string;
  resource_type?: string;
  resource_id?: string;
  version?: number;
  change_type?: string;
  created_by?: string;
  created_at?: string;
  approvals?: Approval[];
  required_approvals?: number;
  description?: string;
}

export interface AuditEntry {
  id: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  user?: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}
