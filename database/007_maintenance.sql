DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='healthkey_maintenance') THEN CREATE ROLE healthkey_maintenance LOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA hk TO healthkey_maintenance;
GRANT EXECUTE ON FUNCTION hk.cleanup(),hk.healthy() TO healthkey_maintenance;
