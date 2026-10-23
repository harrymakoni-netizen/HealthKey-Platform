ALTER TABLE hk.clinics ADD COLUMN IF NOT EXISTS draft_revision uuid;
CREATE TABLE IF NOT EXISTS hk.config_versions(clinic_id uuid NOT NULL REFERENCES hk.clinics(id),version int NOT NULL,actor uuid,configuration jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(clinic_id,version));
ALTER TABLE hk.config_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY version_read ON hk.config_versions FOR SELECT USING(hk.is_admin(clinic_id));
CREATE POLICY version_insert ON hk.config_versions FOR INSERT WITH CHECK(hk.is_admin(clinic_id) AND actor=hk.actor());
GRANT SELECT,INSERT ON hk.config_versions TO healthkey_app;
