-- Hourly scheduled cleanup; public creation fails closed after a 70-minute scheduling gap.
CREATE OR REPLACE FUNCTION hk.create_request(code text,sid uuid,pref text,cap text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE c hk.clinics; r hk.requests_active; display text; BEGIN
 SELECT * INTO c FROM hk.clinics WHERE clinics.code=create_request.code AND active;
 IF c.id IS NULL OR NOT EXISTS(SELECT FROM hk.services WHERE id=sid AND clinic_id=c.id AND active AND (key<>'urgent_private' OR (c.settings->>'urgent_enabled')::boolean)) THEN RAISE EXCEPTION 'invalid_selection'; END IF;
 IF length(cap)<>64 THEN RAISE EXCEPTION 'invalid_capability'; END IF;
 IF (SELECT last_cleanup FROM hk.maintenance WHERE id)<now()-interval '70 minutes' THEN RAISE EXCEPTION 'maintenance_unavailable'; END IF;
 SELECT * INTO r FROM hk.requests_active WHERE capability_hash=cap AND clinic_id=c.id;
 IF r.id IS NOT NULL THEN RETURN jsonb_build_object('public_code',r.public_code,'expires_at',r.expires_at,'status',r.status); END IF;
 IF NOT hk.throttle('clinic:'||c.id,100,60) THEN RAISE EXCEPTION 'rate_limited'; END IF;
 FOR i IN 1..8 LOOP
  display:=upper(substr(encode(public.gen_random_bytes(4),'hex'),1,6));
  BEGIN
   INSERT INTO hk.requests_active(clinic_id,public_code,service_id,communication_pref,capability_hash,expires_at) VALUES(c.id,display,sid,pref,cap,now()+make_interval(mins=>(c.settings->>'ttl_minutes')::int)) RETURNING * INTO r;
   RETURN jsonb_build_object('public_code',r.public_code,'expires_at',r.expires_at,'status',r.status);
  EXCEPTION WHEN unique_violation THEN
   SELECT * INTO r FROM hk.requests_active WHERE capability_hash=cap AND clinic_id=c.id;
   IF r.id IS NOT NULL THEN RETURN jsonb_build_object('public_code',r.public_code,'expires_at',r.expires_at,'status',r.status); END IF;
  END;
 END LOOP;
 RAISE EXCEPTION 'temporarily_unavailable';
END $$;

CREATE OR REPLACE FUNCTION hk.healthy() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ SELECT last_cleanup>now()-interval '70 minutes' FROM hk.maintenance WHERE id $$;
ALTER FUNCTION hk.cleanup() RENAME TO cleanup_content;
CREATE FUNCTION hk.cleanup() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ DECLARE n int;BEGIN
 n:=hk.cleanup_content();
 DELETE FROM hk.creation_contracts WHERE created_at<now()-interval '24 hours';
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION hk.cleanup(),hk.cleanup_content() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION hk.cleanup_content() FROM healthkey_maintenance;
GRANT EXECUTE ON FUNCTION hk.cleanup() TO healthkey_maintenance;
