-- WSLProxy PostgreSQL Initialisation
-- Runs once when the postgres container starts for the first time
-- Creates the wslproxy database user and database, then applies the schema

-- This file is executed as the postgres superuser via docker-entrypoint-initdb.d

-- Create application user (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wslproxy') THEN
        CREATE USER wslproxy WITH PASSWORD 'wslproxy_local_dev';
    END IF;
END
$$;

-- Create database (idempotent via shell wrapper in docker-compose)
-- The database 'wslproxy' is created by POSTGRES_DB env var in docker-compose

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE wslproxy TO wslproxy;
GRANT ALL ON SCHEMA public TO wslproxy;

-- Switch to wslproxy database and apply schema
\c wslproxy

-- Apply full schema
\i /docker-entrypoint-initdb.d/schema.sql

-- Grant table/sequence permissions after schema creation
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO wslproxy;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO wslproxy;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO wslproxy;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO wslproxy;
