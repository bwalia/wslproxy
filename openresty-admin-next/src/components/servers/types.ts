/* ──────────────────────────────────────────────────────────────────────────
   Shared types for the server form components.
   ────────────────────────────────────────────────────────────────────────── */

import type { LocationEntry } from "./sections/LocationBlockEditor";

export interface VarnishConfig {
  listen_address: string;
  listen_port: string;
  admin_listen_port: string;
  cache_ttl_default: number | string;
  cache_grace: number | string;
  cache_keep: number | string;
  cache_size: string;
  backend_connect_timeout: number | string;
  backend_first_byte_timeout: number | string;
  backend_between_bytes_timeout: number | string;
  health_check_enabled: boolean;
  health_check_url: string;
  health_check_interval: number | string;
  health_check_timeout: number | string;
}

export interface VarnishSnippet {
  name: string;
  enabled: boolean;
  priority: number;
  hook_point: string;
  content: string;
}

export interface ServerFormState {
  /* Basic */
  server_name: string;
  proxy_server_name: string;
  profile_id: string;
  servers_tags: string[];
  root: string;
  index: string;
  access_log: string;
  error_log: string;

  /* Listen */
  listens: { listen: string }[];

  /* SSL */
  ssl_enabled: boolean;
  ssl_email: string;
  ssl_auto_renew: boolean;
  ssl_force_https: boolean;
  ssl_staging: boolean;

  /* Cache */
  cache_enabled: boolean;
  cache_ttl: number;
  cache_bypass_auth: boolean;
  cache_bypass_cookie: string;
  cached_mime_types: string[];

  /* WAF */
  waf_enabled: boolean;
  waf_policy_id: string;
  waf_mode_override: string;

  /* Rate limiting */
  rate_limit_enabled: boolean;
  rate_limit: { requests_per_second: number; burst: number };

  /* Headers */
  custom_headers: { header_key: string; header_value: string }[];
  custom_response_headers: { header_key: string; header_value: string }[];

  /* Locations */
  locations: LocationEntry[];

  /* Advanced blocks */
  custom_block: { additional_block: string }[];
  custom_location_block: { additional_location_block: string }[];
  custom_http_block: { additional_http_block: string }[];

  /* Generated config */
  config: string;

  /* Varnish */
  varnish_enabled: boolean;
  varnish_config: VarnishConfig;
  varnish_snippets: VarnishSnippet[];
  varnish_vcl_config: string;

  /* Rules */
  rules: string[];
  match_cases: { condition: string; statement: string[] }[];
}
