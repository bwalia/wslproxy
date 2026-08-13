-- Additive typed schema for WSLProxy PostgreSQL storage.
-- Safe to re-run (IF NOT EXISTS). Does NOT drop config_store.
-- Disk JSON remains the request-path source of truth; these tables
-- are the pgsql-mode index + raw_json document store.

CREATE TABLE IF NOT EXISTS config_store (
    bucket      TEXT NOT NULL,
    key         TEXT NOT NULL,
    value       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bucket, key)
);

CREATE TABLE IF NOT EXISTS servers (
    id                  TEXT NOT NULL,
    env_profile         TEXT NOT NULL,
    server_name         TEXT,
    proxy_server_name   TEXT,
    profile_id          TEXT,
    ssl_enabled         BOOLEAN,
    ssl_force_https     BOOLEAN,
    cache_enabled       BOOLEAN,
    varnish_enabled     BOOLEAN,
    waf_enabled         BOOLEAN,
    waf_policy_id       TEXT,
    rate_limit_enabled  BOOLEAN,
    config_status       BOOLEAN,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    raw_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, env_profile)
);
CREATE INDEX IF NOT EXISTS idx_servers_server_name ON servers (server_name);
CREATE INDEX IF NOT EXISTS idx_servers_waf_policy ON servers (waf_policy_id);
CREATE INDEX IF NOT EXISTS idx_servers_ssl ON servers (ssl_enabled);

CREATE TABLE IF NOT EXISTS server_listens (
    server_id    TEXT NOT NULL,
    env_profile  TEXT NOT NULL,
    listen       TEXT,
    position     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_server_listens_pk ON server_listens (server_id, env_profile);

CREATE TABLE IF NOT EXISTS server_rules (
    server_id    TEXT NOT NULL,
    env_profile  TEXT NOT NULL,
    rule_id      TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_server_rules_pk ON server_rules (server_id, env_profile);

CREATE TABLE IF NOT EXISTS rules (
    id              TEXT NOT NULL,
    env_profile     TEXT NOT NULL,
    name            TEXT,
    priority        INTEGER DEFAULT 0,
    profile_id      TEXT,
    path            TEXT,
    path_key        TEXT,
    status_code     INTEGER,
    redirect_uri    TEXT,
    schema_version  INTEGER DEFAULT 2,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    raw_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, env_profile)
);
CREATE INDEX IF NOT EXISTS idx_rules_name ON rules (name);
CREATE INDEX IF NOT EXISTS idx_rules_path_key ON rules (path_key);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules (priority);

CREATE TABLE IF NOT EXISTS rule_backends (
    rule_id      TEXT NOT NULL,
    env_profile  TEXT NOT NULL,
    address      TEXT,
    weight       INTEGER DEFAULT 1,
    label        TEXT,
    position     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rule_backends_pk ON rule_backends (rule_id, env_profile);

CREATE TABLE IF NOT EXISTS secrets (
    id           TEXT NOT NULL,
    env_profile  TEXT NOT NULL,
    name         TEXT,
    kind         TEXT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, env_profile)
);

CREATE TABLE IF NOT EXISTS instances (
    id           TEXT NOT NULL,
    env_profile  TEXT NOT NULL,
    name         TEXT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, env_profile)
);

CREATE TABLE IF NOT EXISTS upstreams (
    id           TEXT NOT NULL,
    env_profile  TEXT NOT NULL,
    name         TEXT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, env_profile)
);

CREATE TABLE IF NOT EXISTS waf_rules (
    id           TEXT NOT NULL,
    env_profile  TEXT NOT NULL,
    name         TEXT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, env_profile)
);

CREATE TABLE IF NOT EXISTS waf_policies (
    id           TEXT NOT NULL,
    env_profile  TEXT NOT NULL,
    name         TEXT,
    mode         TEXT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, env_profile)
);

CREATE TABLE IF NOT EXISTS waf_events (
    id           TEXT NOT NULL,
    env_profile  TEXT NOT NULL,
    created_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, env_profile)
);

CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT,
    email        TEXT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS pops (
    id           TEXT PRIMARY KEY,
    name         TEXT,
    status       TEXT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS bookmarks (
    id           TEXT PRIMARY KEY,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS profiles (
    id           TEXT PRIMARY KEY,
    name         TEXT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS company_logo (
    id           TEXT PRIMARY KEY,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version      TEXT PRIMARY KEY,
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('0001_baseline')
ON CONFLICT (version) DO NOTHING;
