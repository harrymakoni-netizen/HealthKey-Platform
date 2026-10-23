CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='healthkey_app') THEN CREATE ROLE healthkey_app LOGIN; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS hk;
CREATE TABLE IF NOT EXISTS hk.clinics (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true, version int NOT NULL DEFAULT 1, settings jsonb NOT NULL, draft jsonb);
CREATE TABLE IF NOT EXISTS hk.services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES hk.clinics(id), key text NOT NULL, icon text NOT NULL, active boolean NOT NULL DEFAULT true, sort_order int NOT NULL, labels jsonb NOT NULL, help jsonb NOT NULL, UNIQUE(clinic_id,key), UNIQUE(id,clinic_id));
CREATE TABLE IF NOT EXISTS hk.staff_users (id uuid PRIMARY KEY, clinic_id uuid REFERENCES hk.clinics(id), name text NOT NULL, role text NOT NULL CHECK(role IN ('intake','clinician','admin','platform')), active boolean NOT NULL DEFAULT true, service_ids uuid[] NOT NULL DEFAULT '{}', UNIQUE(id,clinic_id));
CREATE TABLE IF NOT EXISTS hk.requests_active (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES hk.clinics(id), public_code text NOT NULL, service_id uuid NOT NULL, communication_pref text CHECK(communication_pref IN ('spoken','writing','pictures','sign','support')), capability_hash text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','acknowledged','in_progress','completed','cancelled')), created_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz, completed_at timestamptz, expires_at timestamptz NOT NULL, hard_expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', assigned_to uuid, version int NOT NULL DEFAULT 0, FOREIGN KEY(service_id,clinic_id) REFERENCES hk.services(id,clinic_id), FOREIGN KEY(assigned_to,clinic_id) REFERENCES hk.staff_users(id,clinic_id), UNIQUE(clinic_id,public_code));
CREATE INDEX IF NOT EXISTS request_queue ON hk.requests_active(clinic_id,expires_at,created_at);
CREATE TABLE IF NOT EXISTS hk.request_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, request_id uuid NOT NULL REFERENCES hk.requests_active(id) ON DELETE CASCADE, actor uuid, event text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hk.audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, clinic_id uuid, actor uuid, event text NOT NULL, version int, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hk.analytics_daily (clinic_id uuid NOT NULL, day date NOT NULL, service_id uuid NOT NULL, outcome text NOT NULL, count int NOT NULL DEFAULT 0, PRIMARY KEY(clinic_id,day,service_id,outcome));
CREATE TABLE IF NOT EXISTS hk.wait_histogram (clinic_id uuid NOT NULL, day date NOT NULL, seconds int NOT NULL, count int NOT NULL DEFAULT 0, PRIMARY KEY(clinic_id,day,seconds));
CREATE TABLE IF NOT EXISTS hk.throttles (key text PRIMARY KEY, count int NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS hk.maintenance (id boolean PRIMARY KEY DEFAULT true CHECK(id), last_cleanup timestamptz NOT NULL DEFAULT now());
INSERT INTO hk.maintenance(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION hk.actor() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('hk.actor',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION hk.my_staff() RETURNS SETOF hk.staff_users LANGUAGE sql STABLE SECURITY DEFINER SET search_path=hk,pg_temp AS $$ SELECT * FROM hk.staff_users WHERE id=hk.actor() AND active $$;
CREATE OR REPLACE FUNCTION hk.is_admin(cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=hk,pg_temp AS $$ SELECT EXISTS(SELECT FROM hk.my_staff() WHERE clinic_id=cid AND role='admin') $$;
CREATE OR REPLACE FUNCTION hk.is_platform() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=hk,pg_temp AS $$ SELECT EXISTS(SELECT FROM hk.my_staff() WHERE role='platform') $$;
ALTER TABLE hk.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.requests_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.wait_histogram ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_read ON hk.clinics FOR SELECT USING(active OR hk.is_platform());
CREATE POLICY clinic_write ON hk.clinics FOR UPDATE USING(hk.is_admin(id) OR hk.is_platform());
CREATE POLICY service_read ON hk.services FOR SELECT USING(EXISTS(SELECT FROM hk.clinics WHERE id=clinic_id AND active));
CREATE POLICY service_write ON hk.services FOR UPDATE USING(hk.is_admin(clinic_id));
CREATE POLICY staff_read ON hk.staff_users FOR SELECT USING(id=hk.actor() OR clinic_id IN(SELECT clinic_id FROM hk.my_staff() WHERE role IN('intake','admin')));
CREATE POLICY staff_write ON hk.staff_users FOR UPDATE USING(hk.is_admin(clinic_id)) WITH CHECK(hk.is_admin(clinic_id) AND role<>'platform');
CREATE POLICY request_read ON hk.requests_active FOR SELECT USING(expires_at>now() AND hard_expires_at>now() AND status IN('new','acknowledged','in_progress') AND EXISTS(SELECT FROM hk.my_staff() s WHERE s.clinic_id=requests_active.clinic_id AND (s.role='intake' OR (s.role='clinician' AND (assigned_to=s.id OR service_id=ANY(s.service_ids))))));
CREATE POLICY request_write ON hk.requests_active FOR UPDATE USING(EXISTS(SELECT FROM hk.my_staff() s WHERE s.clinic_id=requests_active.clinic_id AND (s.role='intake' OR (s.role='clinician' AND (assigned_to=s.id OR service_id=ANY(s.service_ids)))))) WITH CHECK(EXISTS(SELECT FROM hk.my_staff() s WHERE s.clinic_id=requests_active.clinic_id AND s.role IN('intake','clinician')));
CREATE POLICY events_write ON hk.request_events FOR INSERT WITH CHECK(actor=hk.actor() AND EXISTS(SELECT FROM hk.my_staff() WHERE role IN('intake','clinician')));
CREATE POLICY audit_write ON hk.audit FOR INSERT WITH CHECK(actor=hk.actor() AND (hk.is_admin(clinic_id) OR hk.is_platform()));
CREATE POLICY audit_read ON hk.audit FOR SELECT USING(hk.is_admin(clinic_id) OR hk.is_platform());
CREATE POLICY analytics_read ON hk.analytics_daily FOR SELECT USING(hk.is_admin(clinic_id));
CREATE POLICY histogram_read ON hk.wait_histogram FOR SELECT USING(hk.is_admin(clinic_id));
GRANT USAGE ON SCHEMA hk TO healthkey_app;
GRANT SELECT ON hk.clinics,hk.services,hk.staff_users,hk.requests_active,hk.audit,hk.analytics_daily,hk.wait_histogram TO healthkey_app;
GRANT UPDATE ON hk.clinics,hk.services,hk.staff_users,hk.requests_active TO healthkey_app;
GRANT INSERT ON hk.request_events,hk.audit TO healthkey_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA hk TO healthkey_app;
-- Public operations expose only narrowly defined results; anonymous clients never receive SQL access.
CREATE OR REPLACE FUNCTION hk.throttle(k text, maximum int, seconds int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE n int; BEGIN
 INSERT INTO hk.throttles(key,count,expires_at) VALUES(k,1,now()+make_interval(secs=>seconds)) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN throttles.expires_at<now() THEN 1 ELSE throttles.count+1 END, expires_at=CASE WHEN throttles.expires_at<now() THEN now()+make_interval(secs=>seconds) ELSE throttles.expires_at END RETURNING count INTO n;
 RETURN n<=maximum;
END $$;
CREATE OR REPLACE FUNCTION hk.create_request(code text,sid uuid,pref text,cap text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE c hk.clinics; r hk.requests_active; display text; BEGIN
 SELECT * INTO c FROM hk.clinics WHERE clinics.code=create_request.code AND active;
 IF c.id IS NULL OR NOT EXISTS(SELECT FROM hk.services WHERE id=sid AND clinic_id=c.id AND active AND (key<>'urgent_private' OR (c.settings->>'urgent_enabled')::boolean)) THEN RAISE EXCEPTION 'invalid_selection'; END IF;
 IF length(cap)<>64 THEN RAISE EXCEPTION 'invalid_capability'; END IF;
 IF (SELECT last_cleanup FROM hk.maintenance WHERE id)<now()-interval '5 minutes' THEN RAISE EXCEPTION 'maintenance_unavailable'; END IF;
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
CREATE OR REPLACE FUNCTION hk.public_request(cap text,cancel boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE r hk.requests_active; BEGIN
 SELECT * INTO r FROM hk.requests_active WHERE capability_hash=cap AND expires_at>now() AND hard_expires_at>now() FOR UPDATE;
 IF r.id IS NULL THEN RETURN NULL; END IF;
 IF cancel THEN
  IF r.status<>'new' THEN RAISE EXCEPTION 'not_pending'; END IF;
  UPDATE hk.requests_active SET status='cancelled',completed_at=now() WHERE id=r.id; r.status:='cancelled';
 END IF;
 RETURN jsonb_build_object('public_code',r.public_code,'expires_at',r.expires_at,'status',r.status);
END $$;
CREATE OR REPLACE FUNCTION hk.cleanup() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE r hk.requests_active; n int:=0; result_outcome text; BEGIN
 PERFORM pg_advisory_xact_lock(773982);
 FOR r IN SELECT * FROM hk.requests_active WHERE status IN('completed','cancelled') OR expires_at<=now() OR hard_expires_at<=now() FOR UPDATE LOOP
  result_outcome:=CASE WHEN r.status IN('completed','cancelled') THEN r.status ELSE 'expired' END;
  INSERT INTO hk.analytics_daily VALUES(r.clinic_id,(r.created_at AT TIME ZONE 'Africa/Harare')::date,r.service_id,result_outcome,1) ON CONFLICT(clinic_id,day,service_id,outcome) DO UPDATE SET count=analytics_daily.count+1;
  IF r.acknowledged_at IS NOT NULL THEN INSERT INTO hk.wait_histogram VALUES(r.clinic_id,(r.created_at AT TIME ZONE 'Africa/Harare')::date,greatest(0,round(extract(epoch FROM r.acknowledged_at-r.created_at)))::int,1) ON CONFLICT(clinic_id,day,seconds) DO UPDATE SET count=wait_histogram.count+1; END IF;
  DELETE FROM hk.requests_active WHERE id=r.id; n:=n+1;
 END LOOP;
 DELETE FROM hk.throttles WHERE expires_at<now();
 DELETE FROM hk.audit WHERE created_at<now()-interval '30 days';
 UPDATE hk.maintenance SET last_cleanup=now() WHERE id;
 RETURN n;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hk FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.actor(),hk.my_staff(),hk.is_admin(uuid),hk.is_platform(),hk.throttle(text,int,int),hk.create_request(text,uuid,text,text),hk.public_request(text,boolean) TO healthkey_app;
