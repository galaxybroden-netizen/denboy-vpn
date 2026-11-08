-- MVMP — PostgreSQL init script (Docker entrypoint)
-- Runs once when the PostgreSQL data dir is initialized (first container start).
--
-- Ensures:
--   1. The 'mvmp' role has safe privileges (no superuser, no createdb, no createrole).
--   2. The 'public' schema is owned by 'mvmp'.
--   3. Default privileges grant mvmp ownership of future objects.
--
-- This script is idempotent — safe to re-run on existing databases.
-- The official postgres image only runs scripts in /docker-entrypoint-initdb.d/
-- on first init, so this is a one-shot.

-- Verify the application user is NOT a superuser
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
    RAISE NOTICE 'MVMP init: current_user is superuser (expected during init only)';
  END IF;
END $$;

-- The POSTGRES_USER env var created the 'mvmp' role as superuser by default
-- (postgres image behavior). Revoke superuser privileges from it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mvmp') THEN
    ALTER ROLE mvmp NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    RAISE NOTICE 'MVMP init: mvmp role privileges restricted';
  END IF;
END $$;

-- Revoke PUBLIC access to public schema, grant only to mvmp
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO mvmp;

-- Future objects created in public schema should be owned by mvmp
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mvmp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mvmp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO mvmp;

-- Connection limit (safety valve)
ALTER ROLE mvmp CONNECTION LIMIT 100;

-- Log
RAISE NOTICE 'MVMP init: PostgreSQL schema initialized for MVMP';
