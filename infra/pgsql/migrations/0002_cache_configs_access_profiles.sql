-- 0002: per-host static cache configs and access profiles in the shared store.
-- Before this, cache_manager (pgsql storage) and access_profile wrote only to the
-- pod's local disk. The k3s control plane runs 2 replicas without a data PVC,
-- so those records differed per replica and vanished on restart, and the
-- configuration export (CP -> edges) carried them only by luck (2026-11-22).
-- Additive and idempotent, like 0001.

CREATE TABLE IF NOT EXISTS cache_configs (
    id           TEXT PRIMARY KEY,          -- host without "www." (cache_manager key)
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS access_profiles (
    id           TEXT NOT NULL,             -- profile name
    env_profile  TEXT NOT NULL,
    name         TEXT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    raw_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, env_profile)
);
