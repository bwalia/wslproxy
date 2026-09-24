/* ──────────────────────────────────────────────────────────────────────────
   api_gw form model — mirrors docs/api-gw.schema.json (+ hooks extension).
   Blank fields omit from the saved payload so gateway defaults stay live.
   ────────────────────────────────────────────────────────────────────────── */

export type ApiGwModule =
  | "real_ip"
  | "request_security"
  | "cors"
  | "ivt"
  | "auth"
  | "rate_limit"
  | "audit"
  | "hooks";

export type HeaderOp = {
  op: "set" | "remove" | "rename";
  name?: string;
  value?: string;
  from?: string;
  to?: string;
};

export type LuaHook = {
  name: string;
  phase: "access_before" | "access_after" | "header_filter";
  file?: string;
  source?: string;
};

export type RateProfile = {
  limit: number | "";
  window_seconds: number | "";
  key: "ip" | "consumer" | "header" | "jwt.sub";
  header?: string;
  algorithm?: "" | "sliding" | "fixed";
};

export type ApiGwRoute = {
  name: string;
  path: string;
  path_key: "equals" | "starts_with" | "regex";
  methods: string[];
  auth: "" | "none" | "passthrough" | "jwt" | "api_key";
  rate_profile: string;
  max_body_bytes: number | "";
  ivt_mode: "" | "disabled" | "audit" | "monitor" | "block";
};

export type ApiGwConfig = {
  enabled: boolean;
  tenant_id: string;
  modules: ApiGwModule[];
  real_ip: {
    trusted_cidrs: string[];
    header: string;
    recursive: boolean | null;
  };
  request_security: {
    correlation: {
      enabled: boolean | null;
      header: string;
      echo_downstream: boolean | null;
      accept_inbound: boolean | null;
    };
    content_type: {
      enforce: boolean;
      methods: string[];
      allow: string[];
      exempt_paths: string[];
      status: number | "";
    };
    max_body_bytes: number | "";
    require_content_length: boolean;
    body_status: number | "";
    token_typ: {
      enabled: boolean;
      header: string;
      expect: string[];
      mode: "disabled" | "audit" | "block";
    };
  };
  cors: {
    enabled: boolean | null;
    origins: string[];
    methods: string[];
    headers: string[];
    expose_headers: string[];
    credentials: boolean;
    max_age: number | "";
    preflight_continue: boolean;
    preflight_status: number | "";
  };
  ivt: {
    mode: "disabled" | "audit" | "monitor" | "block";
    methods_allow: string[];
    methods_deny: string[];
    path_denylist: string[];
    require_auth_shape: boolean;
    auth_schemes: string[];
    strip_header_prefixes: string[];
    burst: {
      enabled: boolean | null;
      window_seconds: number | "";
      max_requests: number | "";
      key: "ip" | "header";
      header: string;
    };
    block_threshold: number | "";
    status: number | "";
  };
  auth: {
    strategy: "none" | "passthrough" | "jwt" | "api_key";
    public_paths: string[];
    protected_paths: string[];
    status: number | "";
    allow_unverified_subject: boolean | null;
    jwt: {
      secret_ref: string;
      alg: string;
      header: string;
      cookie: string;
      issuer: string;
      audience: string;
      leeway: number | "";
      claim_key: string;
    };
    api_key: {
      header: string;
      query_param: string;
      keys: string[];
      keys_ref: string;
    };
  };
  rate_limit: {
    enabled: boolean | null;
    algorithm: "sliding" | "fixed";
    default_profile: string;
    status: number | "";
    headers_standard: boolean | null;
    headers_legacy: boolean | null;
    profiles: Record<string, RateProfile>;
  };
  audit: {
    enabled: boolean | null;
    level: "debug" | "info" | "notice" | "warn" | "error";
    tag: string;
    sample_rate: number | "";
    include_query: boolean;
    include_client_ip: boolean;
    include_headers: string[];
    redact_headers: string[];
  };
  hooks: {
    enabled: boolean;
    request_headers: HeaderOp[];
    response_headers: HeaderOp[];
    lua: LuaHook[];
  };
  routes: ApiGwRoute[];
};

export const API_GW_MODULES: { id: ApiGwModule; label: string }[] = [
  { id: "real_ip", label: "real_ip — trusted proxies" },
  {
    id: "request_security",
    label: "request_security — correlation + content-type + body",
  },
  { id: "cors", label: "cors" },
  { id: "ivt", label: "ivt — invalid traffic guard" },
  { id: "auth", label: "auth" },
  { id: "rate_limit", label: "rate_limit" },
  { id: "audit", label: "audit" },
  { id: "hooks", label: "hooks — header transforms + Lua" },
];

export const HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

export const DEFAULT_RATE_PROFILES: Record<string, RateProfile> = {
  health: { limit: 0, window_seconds: 60, key: "ip", algorithm: "" },
  auth: { limit: 10, window_seconds: 60, key: "ip", algorithm: "" },
  public: { limit: 120, window_seconds: 60, key: "ip", algorithm: "" },
  standard: { limit: 600, window_seconds: 60, key: "consumer", algorithm: "" },
  expensive: { limit: 30, window_seconds: 60, key: "consumer", algorithm: "" },
  webhook: { limit: 1200, window_seconds: 60, key: "ip", algorithm: "" },
};

export function defaultApiGwConfig(): ApiGwConfig {
  return {
    enabled: false,
    tenant_id: "",
    modules: [],
    real_ip: { trusted_cidrs: [], header: "", recursive: null },
    request_security: {
      correlation: {
        enabled: null,
        header: "",
        echo_downstream: null,
        accept_inbound: null,
      },
      content_type: {
        enforce: false,
        methods: [],
        allow: [],
        exempt_paths: [],
        status: "",
      },
      max_body_bytes: "",
      require_content_length: false,
      body_status: "",
      token_typ: {
        enabled: false,
        header: "",
        expect: [],
        mode: "audit",
      },
    },
    cors: {
      enabled: null,
      origins: [],
      methods: [],
      headers: [],
      expose_headers: [],
      credentials: false,
      max_age: "",
      preflight_continue: false,
      preflight_status: "",
    },
    ivt: {
      mode: "audit",
      methods_allow: [],
      methods_deny: [],
      path_denylist: [],
      require_auth_shape: false,
      auth_schemes: [],
      strip_header_prefixes: [],
      burst: {
        enabled: null,
        window_seconds: "",
        max_requests: "",
        key: "ip",
        header: "",
      },
      block_threshold: "",
      status: "",
    },
    auth: {
      strategy: "passthrough",
      public_paths: [],
      protected_paths: [],
      status: "",
      allow_unverified_subject: null,
      jwt: {
        secret_ref: "",
        alg: "",
        header: "",
        cookie: "",
        issuer: "",
        audience: "",
        leeway: "",
        claim_key: "",
      },
      api_key: {
        header: "",
        query_param: "",
        keys: [],
        keys_ref: "",
      },
    },
    rate_limit: {
      enabled: null,
      algorithm: "sliding",
      default_profile: "",
      status: "",
      headers_standard: null,
      headers_legacy: null,
      profiles: { ...DEFAULT_RATE_PROFILES },
    },
    audit: {
      enabled: null,
      level: "info",
      tag: "",
      sample_rate: "",
      include_query: false,
      include_client_ip: false,
      include_headers: [],
      redact_headers: [],
    },
    hooks: {
      enabled: false,
      request_headers: [],
      response_headers: [],
      lua: [],
    },
    routes: [],
  };
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim())
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function numOrEmpty(v: unknown): number | "" {
  if (v === undefined || v === null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

function boolOrNull(v: unknown): boolean | null {
  if (v === undefined || v === null) return null;
  return Boolean(v);
}

/** Hydrate form state from disk / API payload. */
export function hydrateApiGw(raw: unknown): ApiGwConfig {
  const base = defaultApiGwConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  base.enabled = Boolean(r.enabled);
  base.tenant_id = typeof r.tenant_id === "string" ? r.tenant_id : "";
  base.modules = arr(r.modules).filter((m) =>
    API_GW_MODULES.some((x) => x.id === m),
  ) as ApiGwModule[];

  const ri = (r.real_ip as Record<string, unknown>) || {};
  base.real_ip = {
    trusted_cidrs: arr(ri.trusted_cidrs),
    header: typeof ri.header === "string" ? ri.header : "",
    recursive: boolOrNull(ri.recursive),
  };

  const rs = (r.request_security as Record<string, unknown>) || {};
  const corr = (rs.correlation as Record<string, unknown>) || {};
  const ct = (rs.content_type as Record<string, unknown>) || {};
  const typ = (rs.token_typ as Record<string, unknown>) || {};
  base.request_security = {
    correlation: {
      enabled: boolOrNull(corr.enabled),
      header: typeof corr.header === "string" ? corr.header : "",
      echo_downstream: boolOrNull(corr.echo_downstream),
      accept_inbound: boolOrNull(corr.accept_inbound),
    },
    content_type: {
      enforce: Boolean(ct.enforce),
      methods: arr(ct.methods),
      allow: arr(ct.allow),
      exempt_paths: arr(ct.exempt_paths),
      status: numOrEmpty(ct.status),
    },
    max_body_bytes: numOrEmpty(rs.max_body_bytes),
    require_content_length: Boolean(rs.require_content_length),
    body_status: numOrEmpty(rs.body_status),
    token_typ: {
      enabled: Boolean(typ.enabled),
      header: typeof typ.header === "string" ? typ.header : "",
      expect: arr(typ.expect),
      mode: (["disabled", "audit", "block"].includes(String(typ.mode))
        ? typ.mode
        : "audit") as "disabled" | "audit" | "block",
    },
  };

  const cors = (r.cors as Record<string, unknown>) || {};
  base.cors = {
    enabled: boolOrNull(cors.enabled),
    origins: arr(cors.origins),
    methods: arr(cors.methods),
    headers: arr(cors.headers),
    expose_headers: arr(cors.expose_headers),
    credentials: Boolean(cors.credentials),
    max_age: numOrEmpty(cors.max_age),
    preflight_continue: Boolean(cors.preflight_continue),
    preflight_status: numOrEmpty(cors.preflight_status),
  };

  const ivt = (r.ivt as Record<string, unknown>) || {};
  const methods = (ivt.methods as Record<string, unknown>) || {};
  const burst = (ivt.burst as Record<string, unknown>) || {};
  base.ivt = {
    mode: (["disabled", "audit", "monitor", "block"].includes(String(ivt.mode))
      ? ivt.mode
      : "audit") as ApiGwConfig["ivt"]["mode"],
    methods_allow: arr(methods.allow),
    methods_deny: arr(methods.deny),
    path_denylist: arr(ivt.path_denylist),
    require_auth_shape: Boolean(ivt.require_auth_shape),
    auth_schemes: arr(ivt.auth_schemes),
    strip_header_prefixes: arr(ivt.strip_header_prefixes),
    burst: {
      enabled: boolOrNull(burst.enabled),
      window_seconds: numOrEmpty(burst.window_seconds),
      max_requests: numOrEmpty(burst.max_requests),
      key: burst.key === "header" ? "header" : "ip",
      header: typeof burst.header === "string" ? burst.header : "",
    },
    block_threshold: numOrEmpty(ivt.block_threshold),
    status: numOrEmpty(ivt.status),
  };

  const auth = (r.auth as Record<string, unknown>) || {};
  const jwt = (auth.jwt as Record<string, unknown>) || {};
  const apiKey = (auth.api_key as Record<string, unknown>) || {};
  base.auth = {
    strategy: (["none", "passthrough", "jwt", "api_key"].includes(
      String(auth.strategy),
    )
      ? auth.strategy
      : "passthrough") as ApiGwConfig["auth"]["strategy"],
    public_paths: arr(auth.public_paths),
    protected_paths: arr(auth.protected_paths),
    status: numOrEmpty(auth.status),
    allow_unverified_subject: boolOrNull(auth.allow_unverified_subject),
    jwt: {
      secret_ref: typeof jwt.secret_ref === "string" ? jwt.secret_ref : "",
      alg: typeof jwt.alg === "string" ? jwt.alg : "",
      header: typeof jwt.header === "string" ? jwt.header : "",
      cookie: typeof jwt.cookie === "string" ? jwt.cookie : "",
      issuer: typeof jwt.issuer === "string" ? jwt.issuer : "",
      audience: typeof jwt.audience === "string" ? jwt.audience : "",
      leeway: numOrEmpty(jwt.leeway),
      claim_key: typeof jwt.claim_key === "string" ? jwt.claim_key : "",
    },
    api_key: {
      header: typeof apiKey.header === "string" ? apiKey.header : "",
      query_param:
        typeof apiKey.query_param === "string" ? apiKey.query_param : "",
      keys: arr(apiKey.keys),
      keys_ref: typeof apiKey.keys_ref === "string" ? apiKey.keys_ref : "",
    },
  };

  const rl = (r.rate_limit as Record<string, unknown>) || {};
  const rlHdr = (rl.headers as Record<string, unknown>) || {};
  const profiles: Record<string, RateProfile> = {
    ...DEFAULT_RATE_PROFILES,
  };
  if (rl.profiles && typeof rl.profiles === "object") {
    for (const [name, rawP] of Object.entries(
      rl.profiles as Record<string, Record<string, unknown>>,
    )) {
      profiles[name] = {
        limit: numOrEmpty(rawP.limit),
        window_seconds: numOrEmpty(rawP.window_seconds) || 60,
        key: (["ip", "consumer", "header", "jwt.sub"].includes(String(rawP.key))
          ? rawP.key
          : "ip") as RateProfile["key"],
        header: typeof rawP.header === "string" ? rawP.header : "",
        algorithm: (["", "sliding", "fixed"].includes(String(rawP.algorithm ?? ""))
          ? (rawP.algorithm as RateProfile["algorithm"]) || ""
          : ""),
      };
    }
  }
  base.rate_limit = {
    enabled: boolOrNull(rl.enabled),
    algorithm: rl.algorithm === "fixed" ? "fixed" : "sliding",
    default_profile:
      typeof rl.default_profile === "string" ? rl.default_profile : "",
    status: numOrEmpty(rl.status),
    headers_standard: boolOrNull(rlHdr.standard),
    headers_legacy: boolOrNull(rlHdr.legacy),
    profiles,
  };

  const audit = (r.audit as Record<string, unknown>) || {};
  base.audit = {
    enabled: boolOrNull(audit.enabled),
    level: (["debug", "info", "notice", "warn", "error"].includes(
      String(audit.level),
    )
      ? audit.level
      : "info") as ApiGwConfig["audit"]["level"],
    tag: typeof audit.tag === "string" ? audit.tag : "",
    sample_rate: numOrEmpty(audit.sample_rate),
    include_query: Boolean(audit.include_query),
    include_client_ip: Boolean(audit.include_client_ip),
    include_headers: arr(audit.include_headers),
    redact_headers: arr(audit.redact_headers),
  };

  const hooks = (r.hooks as Record<string, unknown>) || {};
  const mapOps = (list: unknown): HeaderOp[] =>
    Array.isArray(list)
      ? list
          .filter((x) => x && typeof x === "object")
          .map((x) => {
            const o = x as Record<string, unknown>;
            return {
              op: (["set", "remove", "rename"].includes(String(o.op))
                ? o.op
                : "set") as HeaderOp["op"],
              name: typeof o.name === "string" ? o.name : "",
              value: typeof o.value === "string" ? o.value : "",
              from: typeof o.from === "string" ? o.from : "",
              to: typeof o.to === "string" ? o.to : "",
            };
          })
      : [];
  base.hooks = {
    enabled: Boolean(hooks.enabled),
    request_headers: mapOps(hooks.request_headers),
    response_headers: mapOps(hooks.response_headers),
    lua: Array.isArray(hooks.lua)
      ? hooks.lua
          .filter((x) => x && typeof x === "object")
          .map((x) => {
            const o = x as Record<string, unknown>;
            return {
              name: typeof o.name === "string" ? o.name : "",
              phase: (["access_before", "access_after", "header_filter"].includes(
                String(o.phase),
              )
                ? o.phase
                : "access_before") as LuaHook["phase"],
              file: typeof o.file === "string" ? o.file : "",
              source: typeof o.source === "string" ? o.source : "",
            };
          })
      : [],
  };

  base.routes = Array.isArray(r.routes)
    ? r.routes
        .filter((x) => x && typeof x === "object")
        .map((x) => {
          const o = x as Record<string, unknown>;
          return {
            name: typeof o.name === "string" ? o.name : "",
            path: typeof o.path === "string" ? o.path : "",
            path_key: (["equals", "starts_with", "regex"].includes(
              String(o.path_key),
            )
              ? o.path_key
              : "starts_with") as ApiGwRoute["path_key"],
            methods: arr(o.methods),
            auth: (["", "none", "passthrough", "jwt", "api_key"].includes(
              String(o.auth ?? ""),
            )
              ? (o.auth as ApiGwRoute["auth"]) || ""
              : ""),
            rate_profile:
              typeof o.rate_profile === "string" ? o.rate_profile : "",
            max_body_bytes: numOrEmpty(o.max_body_bytes),
            ivt_mode: (["", "disabled", "audit", "monitor", "block"].includes(
              String(o.ivt_mode ?? ""),
            )
              ? (o.ivt_mode as ApiGwRoute["ivt_mode"]) || ""
              : ""),
          };
        })
    : [];

  return base;
}

function omitEmptyString(v: string | undefined): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return v;
}

function omitEmptyNum(v: number | "" | undefined): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return Number(v);
}

function omitEmptyArr(v: string[] | undefined): string[] | undefined {
  if (!v || v.length === 0) return undefined;
  return v;
}

/** Build the nested api_gw object for PUT/POST — omit blanks so Lua defaults apply. */
export function serializeApiGw(cfg: ApiGwConfig): Record<string, unknown> | undefined {
  if (!cfg.enabled) {
    // Persist enabled:false so operators can flip it back without losing nested config.
    // Still include nested when any meaningful data exists.
  }

  const out: Record<string, unknown> = { enabled: cfg.enabled };
  if (cfg.tenant_id) out.tenant_id = cfg.tenant_id;
  if (cfg.modules.length) out.modules = cfg.modules;

  const real_ip: Record<string, unknown> = {};
  if (cfg.real_ip.trusted_cidrs.length)
    real_ip.trusted_cidrs = cfg.real_ip.trusted_cidrs;
  if (cfg.real_ip.header) real_ip.header = cfg.real_ip.header;
  if (cfg.real_ip.recursive !== null) real_ip.recursive = cfg.real_ip.recursive;
  if (Object.keys(real_ip).length) out.real_ip = real_ip;

  const rs: Record<string, unknown> = {};
  const corr: Record<string, unknown> = {};
  if (cfg.request_security.correlation.enabled !== null)
    corr.enabled = cfg.request_security.correlation.enabled;
  if (cfg.request_security.correlation.header)
    corr.header = cfg.request_security.correlation.header;
  if (cfg.request_security.correlation.echo_downstream !== null)
    corr.echo_downstream = cfg.request_security.correlation.echo_downstream;
  if (cfg.request_security.correlation.accept_inbound !== null)
    corr.accept_inbound = cfg.request_security.correlation.accept_inbound;
  if (Object.keys(corr).length) rs.correlation = corr;

  const ct: Record<string, unknown> = {};
  if (cfg.request_security.content_type.enforce) ct.enforce = true;
  if (cfg.request_security.content_type.methods.length)
    ct.methods = cfg.request_security.content_type.methods;
  if (cfg.request_security.content_type.allow.length)
    ct.allow = cfg.request_security.content_type.allow;
  if (cfg.request_security.content_type.exempt_paths.length)
    ct.exempt_paths = cfg.request_security.content_type.exempt_paths;
  const ctStatus = omitEmptyNum(cfg.request_security.content_type.status);
  if (ctStatus !== undefined) ct.status = ctStatus;
  if (Object.keys(ct).length) rs.content_type = ct;

  const maxBody = omitEmptyNum(cfg.request_security.max_body_bytes);
  if (maxBody !== undefined) rs.max_body_bytes = maxBody;
  if (cfg.request_security.require_content_length)
    rs.require_content_length = true;
  const bodyStatus = omitEmptyNum(cfg.request_security.body_status);
  if (bodyStatus !== undefined) rs.body_status = bodyStatus;

  if (cfg.request_security.token_typ.enabled) {
    rs.token_typ = {
      enabled: true,
      ...(cfg.request_security.token_typ.header
        ? { header: cfg.request_security.token_typ.header }
        : {}),
      ...(cfg.request_security.token_typ.expect.length
        ? { expect: cfg.request_security.token_typ.expect }
        : {}),
      mode: cfg.request_security.token_typ.mode,
    };
  }
  if (Object.keys(rs).length) out.request_security = rs;

  const cors: Record<string, unknown> = {};
  if (cfg.cors.enabled !== null) cors.enabled = cfg.cors.enabled;
  if (cfg.cors.origins.length) cors.origins = cfg.cors.origins;
  if (cfg.cors.methods.length) cors.methods = cfg.cors.methods;
  if (cfg.cors.headers.length) cors.headers = cfg.cors.headers;
  if (cfg.cors.expose_headers.length)
    cors.expose_headers = cfg.cors.expose_headers;
  if (cfg.cors.credentials) cors.credentials = true;
  const maxAge = omitEmptyNum(cfg.cors.max_age);
  if (maxAge !== undefined) cors.max_age = maxAge;
  if (cfg.cors.preflight_continue) cors.preflight_continue = true;
  const pfStatus = omitEmptyNum(cfg.cors.preflight_status);
  if (pfStatus !== undefined) cors.preflight_status = pfStatus;
  if (Object.keys(cors).length) out.cors = cors;

  const ivt: Record<string, unknown> = { mode: cfg.ivt.mode };
  const ivtMethods: Record<string, unknown> = {};
  if (cfg.ivt.methods_allow.length) ivtMethods.allow = cfg.ivt.methods_allow;
  if (cfg.ivt.methods_deny.length) ivtMethods.deny = cfg.ivt.methods_deny;
  if (Object.keys(ivtMethods).length) ivt.methods = ivtMethods;
  if (cfg.ivt.path_denylist.length) ivt.path_denylist = cfg.ivt.path_denylist;
  if (cfg.ivt.require_auth_shape) ivt.require_auth_shape = true;
  if (cfg.ivt.auth_schemes.length) ivt.auth_schemes = cfg.ivt.auth_schemes;
  if (cfg.ivt.strip_header_prefixes.length)
    ivt.strip_header_prefixes = cfg.ivt.strip_header_prefixes;
  const burst: Record<string, unknown> = {};
  if (cfg.ivt.burst.enabled !== null) burst.enabled = cfg.ivt.burst.enabled;
  const bw = omitEmptyNum(cfg.ivt.burst.window_seconds);
  if (bw !== undefined) burst.window_seconds = bw;
  const bm = omitEmptyNum(cfg.ivt.burst.max_requests);
  if (bm !== undefined) burst.max_requests = bm;
  if (cfg.ivt.burst.key !== "ip") burst.key = cfg.ivt.burst.key;
  if (cfg.ivt.burst.header) burst.header = cfg.ivt.burst.header;
  if (Object.keys(burst).length) ivt.burst = burst;
  const bt = omitEmptyNum(cfg.ivt.block_threshold);
  if (bt !== undefined) ivt.block_threshold = bt;
  const ist = omitEmptyNum(cfg.ivt.status);
  if (ist !== undefined) ivt.status = ist;
  out.ivt = ivt;

  const auth: Record<string, unknown> = { strategy: cfg.auth.strategy };
  if (cfg.auth.public_paths.length) auth.public_paths = cfg.auth.public_paths;
  if (cfg.auth.protected_paths.length)
    auth.protected_paths = cfg.auth.protected_paths;
  const authStatus = omitEmptyNum(cfg.auth.status);
  if (authStatus !== undefined) auth.status = authStatus;
  if (cfg.auth.allow_unverified_subject !== null)
    auth.allow_unverified_subject = cfg.auth.allow_unverified_subject;
  const jwt: Record<string, unknown> = {};
  if (cfg.auth.jwt.secret_ref) jwt.secret_ref = cfg.auth.jwt.secret_ref;
  if (cfg.auth.jwt.alg) jwt.alg = cfg.auth.jwt.alg;
  if (cfg.auth.jwt.header) jwt.header = cfg.auth.jwt.header;
  if (cfg.auth.jwt.cookie) jwt.cookie = cfg.auth.jwt.cookie;
  if (cfg.auth.jwt.issuer) jwt.issuer = cfg.auth.jwt.issuer;
  if (cfg.auth.jwt.audience) jwt.audience = cfg.auth.jwt.audience;
  const leeway = omitEmptyNum(cfg.auth.jwt.leeway);
  if (leeway !== undefined) jwt.leeway = leeway;
  if (cfg.auth.jwt.claim_key) jwt.claim_key = cfg.auth.jwt.claim_key;
  if (Object.keys(jwt).length) auth.jwt = jwt;
  const apiKey: Record<string, unknown> = {};
  if (cfg.auth.api_key.header) apiKey.header = cfg.auth.api_key.header;
  if (cfg.auth.api_key.query_param)
    apiKey.query_param = cfg.auth.api_key.query_param;
  if (cfg.auth.api_key.keys.length) apiKey.keys = cfg.auth.api_key.keys;
  if (cfg.auth.api_key.keys_ref) apiKey.keys_ref = cfg.auth.api_key.keys_ref;
  if (Object.keys(apiKey).length) auth.api_key = apiKey;
  out.auth = auth;

  const rl: Record<string, unknown> = {};
  if (cfg.rate_limit.enabled !== null) rl.enabled = cfg.rate_limit.enabled;
  if (cfg.rate_limit.algorithm !== "sliding")
    rl.algorithm = cfg.rate_limit.algorithm;
  if (cfg.rate_limit.default_profile)
    rl.default_profile = cfg.rate_limit.default_profile;
  const rlStatus = omitEmptyNum(cfg.rate_limit.status);
  if (rlStatus !== undefined) rl.status = rlStatus;
  const rlHeaders: Record<string, unknown> = {};
  if (cfg.rate_limit.headers_standard !== null)
    rlHeaders.standard = cfg.rate_limit.headers_standard;
  if (cfg.rate_limit.headers_legacy !== null)
    rlHeaders.legacy = cfg.rate_limit.headers_legacy;
  if (Object.keys(rlHeaders).length) rl.headers = rlHeaders;
  const profilesOut: Record<string, unknown> = {};
  for (const [name, p] of Object.entries(cfg.rate_limit.profiles)) {
    const entry: Record<string, unknown> = {};
    const lim = omitEmptyNum(p.limit);
    if (lim !== undefined) entry.limit = lim;
    const win = omitEmptyNum(p.window_seconds);
    if (win !== undefined) entry.window_seconds = win;
    if (p.key) entry.key = p.key;
    if (p.header) entry.header = p.header;
    if (p.algorithm) entry.algorithm = p.algorithm;
    if (Object.keys(entry).length) profilesOut[name] = entry;
  }
  if (Object.keys(profilesOut).length) rl.profiles = profilesOut;
  if (Object.keys(rl).length) out.rate_limit = rl;

  const audit: Record<string, unknown> = {};
  if (cfg.audit.enabled !== null) audit.enabled = cfg.audit.enabled;
  if (cfg.audit.level !== "info") audit.level = cfg.audit.level;
  if (cfg.audit.tag) audit.tag = cfg.audit.tag;
  const sr = omitEmptyNum(cfg.audit.sample_rate);
  if (sr !== undefined) audit.sample_rate = sr;
  if (cfg.audit.include_query) audit.include_query = true;
  if (cfg.audit.include_client_ip) audit.include_client_ip = true;
  const ih = omitEmptyArr(cfg.audit.include_headers);
  if (ih) audit.include_headers = ih;
  const rh = omitEmptyArr(cfg.audit.redact_headers);
  if (rh) audit.redact_headers = rh;
  if (Object.keys(audit).length) out.audit = audit;

  const hooks: Record<string, unknown> = { enabled: cfg.hooks.enabled };
  if (cfg.hooks.request_headers.length) {
    hooks.request_headers = cfg.hooks.request_headers
      .filter((o) => o.op)
      .map((o) => {
        const e: Record<string, unknown> = { op: o.op };
        if (o.name) e.name = o.name;
        if (o.value) e.value = o.value;
        if (o.from) e.from = o.from;
        if (o.to) e.to = o.to;
        return e;
      });
  }
  if (cfg.hooks.response_headers.length) {
    hooks.response_headers = cfg.hooks.response_headers
      .filter((o) => o.op)
      .map((o) => {
        const e: Record<string, unknown> = { op: o.op };
        if (o.name) e.name = o.name;
        if (o.value) e.value = o.value;
        if (o.from) e.from = o.from;
        if (o.to) e.to = o.to;
        return e;
      });
  }
  if (cfg.hooks.lua.length) {
    hooks.lua = cfg.hooks.lua
      .filter((h) => h.name || h.file || h.source)
      .map((h) => {
        const e: Record<string, unknown> = { phase: h.phase };
        if (h.name) e.name = h.name;
        if (h.file) e.file = h.file;
        if (h.source) e.source = h.source;
        return e;
      });
  }
  if (
    cfg.hooks.enabled ||
    cfg.hooks.request_headers.length ||
    cfg.hooks.response_headers.length ||
    cfg.hooks.lua.length
  ) {
    out.hooks = hooks;
  }

  if (cfg.routes.length) {
    out.routes = cfg.routes
      .filter((rt) => rt.path)
      .map((rt) => {
        const e: Record<string, unknown> = { path: rt.path };
        if (rt.name) e.name = rt.name;
        if (rt.path_key && rt.path_key !== "starts_with")
          e.path_key = rt.path_key;
        if (rt.methods.length) e.methods = rt.methods;
        if (rt.auth) e.auth = rt.auth;
        if (rt.rate_profile) e.rate_profile = rt.rate_profile;
        const mb = omitEmptyNum(rt.max_body_bytes);
        if (mb !== undefined) e.max_body_bytes = mb;
        if (rt.ivt_mode) e.ivt_mode = rt.ivt_mode;
        return e;
      });
  }

  // Always persist when enabled, or when any nested policy exists
  if (!cfg.enabled && Object.keys(out).length === 1) {
    return { enabled: false };
  }
  return out;
}

export { omitEmptyString };
