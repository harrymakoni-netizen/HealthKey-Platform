CREATE OR REPLACE FUNCTION hk.healthy() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ SELECT last_cleanup>now()-interval '5 minutes' FROM hk.maintenance WHERE id $$;
REVOKE ALL ON FUNCTION hk.healthy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.healthy() TO healthkey_app;
