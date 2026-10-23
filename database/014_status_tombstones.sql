-- Content-free terminal status survives content purge for at most 30 days.
CREATE TABLE hk.referral_outcomes(id uuid PRIMARY KEY,source_clinic_id uuid NOT NULL,target_clinic_id uuid NOT NULL,target_listing_id uuid NOT NULL,holder_digest text NOT NULL,responsible_staff uuid NOT NULL,state text NOT NULL,expires_at timestamptz NOT NULL,outcome text,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE hk.referral_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY outcome_read ON hk.referral_outcomes FOR SELECT USING(holder_digest=hk.holder() OR hk.referral_source(source_clinic_id,responsible_staff) OR target_clinic_id IN(SELECT clinic_id FROM hk.my_staff() WHERE role='clinician'));
GRANT SELECT ON hk.referral_outcomes TO healthkey_app;
CREATE FUNCTION hk.keep_referral_outcome() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ BEGIN
 INSERT INTO hk.referral_outcomes VALUES(OLD.id,OLD.source_clinic_id,OLD.target_clinic_id,OLD.target_listing_id,OLD.holder_digest,OLD.responsible_staff,CASE WHEN OLD.expires_at<=now() THEN 'expired' ELSE OLD.state END,OLD.expires_at,OLD.outcome,now()) ON CONFLICT DO NOTHING;
 DELETE FROM hk.referral_outcomes WHERE created_at<now()-interval '30 days';
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION hk.keep_referral_outcome() FROM PUBLIC;
CREATE TRIGGER keep_terminal_status BEFORE DELETE ON hk.referrals FOR EACH ROW EXECUTE FUNCTION hk.keep_referral_outcome();
