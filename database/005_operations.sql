CREATE TABLE IF NOT EXISTS hk.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE hk.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizations_platform ON hk.organizations FOR ALL USING(hk.is_platform()) WITH CHECK(hk.is_platform());
GRANT SELECT,INSERT,UPDATE ON hk.organizations TO healthkey_app;
ALTER TABLE hk.clinics ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES hk.organizations(id);
CREATE POLICY clinic_insert ON hk.clinics FOR INSERT WITH CHECK(hk.is_platform());
CREATE POLICY service_insert ON hk.services FOR INSERT WITH CHECK(hk.is_platform());
GRANT INSERT ON hk.clinics,hk.services TO healthkey_app;
CREATE TABLE IF NOT EXISTS hk.usage_daily(clinic_id uuid NOT NULL REFERENCES hk.clinics(id),day date NOT NULL,metric text NOT NULL,value text NOT NULL,count int NOT NULL DEFAULT 0,PRIMARY KEY(clinic_id,day,metric,value));
ALTER TABLE hk.usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_read ON hk.usage_daily FOR SELECT USING(hk.is_admin(clinic_id));
GRANT SELECT ON hk.usage_daily TO healthkey_app;
CREATE OR REPLACE FUNCTION hk.count_usage(code text,metric text,value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE cid uuid; BEGIN
 SELECT id INTO cid FROM hk.clinics WHERE clinics.code=count_usage.code AND active;
 IF cid IS NULL THEN RETURN; END IF;
 IF NOT ((metric='language' AND value IN('en','sn','nd')) OR (metric='accessibility' AND value IN('large','contrast','simple')) OR (metric='offline' AND value='display')) THEN RETURN; END IF;
 IF NOT hk.throttle('usage:'||cid,1000,60) THEN RETURN; END IF;
 INSERT INTO hk.usage_daily VALUES(cid,(now() AT TIME ZONE 'Africa/Harare')::date,metric,value,1) ON CONFLICT ON CONSTRAINT usage_daily_pkey DO UPDATE SET count=usage_daily.count+1;
END $$;
REVOKE ALL ON FUNCTION hk.count_usage(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.count_usage(text,text,text) TO healthkey_app;
