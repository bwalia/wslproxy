-- WSLProxy PostgreSQL Schema
-- Storage backend for servers, rules, and all configuration resources
-- Applied automatically by docker-compose (mounted as /docker-entrypoint-initdb.d/)

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- Primary config store table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_store (
    id           SERIAL,
    uuid         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50)  NOT NULL,  -- e.g. "servers", "rules", "waf_rules"
    resource_name VARCHAR(200) NOT NULL,  -- e.g. "host:api.example.com", rule UUID
    env_profile  VARCHAR(50)  NOT NULL DEFAULT 'prod', -- e.g. "prod", "int", "dev"
    version      INTEGER      NOT NULL DEFAULT 1,
    status       VARCHAR(20)  NOT NULL DEFAULT 'active', -- active | deleted | archived
    payload      JSONB        NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Unique active record per (type, name, profile)
CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_unique
    ON config_store (resource_type, resource_name, env_profile)
    WHERE status = 'active';

-- Fast lookup by type + profile
CREATE INDEX IF NOT EXISTS idx_resource_type
    ON config_store (resource_type, env_profile);

-- Full-text search inside payload JSON
CREATE INDEX IF NOT EXISTS idx_payload_gin
    ON config_store USING GIN (payload);

-- ─────────────────────────────────────────────
-- Automatic updated_at trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_config_store_updated_at ON config_store;
CREATE TRIGGER trg_config_store_updated_at
    BEFORE UPDATE ON config_store
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- Version history table (append-only)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_versions (
    id           SERIAL PRIMARY KEY,
    resource_type VARCHAR(50)  NOT NULL,
    resource_name VARCHAR(200) NOT NULL,
    env_profile  VARCHAR(50)  NOT NULL DEFAULT 'prod',
    version      INTEGER      NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'live', -- live | superseded | rolled_back
    payload      JSONB        NOT NULL,
    created_by   VARCHAR(100),
    change_note  TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_versions_lookup
    ON config_versions (resource_type, resource_name, env_profile, version DESC);

-- ─────────────────────────────────────────────
-- Change requests table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_requests (
    id           SERIAL PRIMARY KEY,
    cr_id        UUID         NOT NULL DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    resource_name VARCHAR(200) NOT NULL,
    env_profile  VARCHAR(50) NOT NULL DEFAULT 'prod',
    action       VARCHAR(20) NOT NULL, -- create | update | delete
    status       VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | applied
    payload_before JSONB,
    payload_after  JSONB NOT NULL,
    requested_by VARCHAR(100),
    approved_by  VARCHAR(100),
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cr_status
    ON change_requests (status, env_profile);

DROP TRIGGER IF EXISTS trg_change_requests_updated_at ON change_requests;
CREATE TRIGGER trg_change_requests_updated_at
    BEFORE UPDATE ON change_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- Audit log table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id           SERIAL PRIMARY KEY,
    resource_type VARCHAR(50),
    resource_name VARCHAR(200),
    env_profile  VARCHAR(50) DEFAULT 'prod',
    action       VARCHAR(50) NOT NULL, -- READ | CREATE | UPDATE | DELETE
    actor        VARCHAR(100),
    ip_address   VARCHAR(45),
    user_agent   TEXT,
    payload      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_resource
    ON audit_log (resource_type, resource_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON audit_log (actor, created_at DESC);

-- ─────────────────────────────────────────────
-- Useful views
-- ─────────────────────────────────────────────

-- Active servers per profile
CREATE OR REPLACE VIEW v_active_servers AS
SELECT
    resource_name AS server_id,
    env_profile,
    version,
    payload,
    created_at,
    updated_at
FROM config_store
WHERE resource_type = 'servers' AND status = 'active';

-- Active rules per profile
CREATE OR REPLACE VIEW v_active_rules AS
SELECT
    resource_name AS rule_id,
    env_profile,
    version,
    payload,
    created_at,
    updated_at
FROM config_store
WHERE resource_type = 'request_rules' AND status = 'active';
