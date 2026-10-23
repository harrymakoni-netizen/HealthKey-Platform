-- Additive upgrade. No historical messages, audit or translated labels are removed.
ALTER TABLE hk.staff_users DROP CONSTRAINT staff_users_role_check;
ALTER TABLE hk.staff_users ADD CONSTRAINT staff_users_role_check CHECK(role IN('intake','clinician','admin','platform','verifier'));
ALTER TABLE hk.requests_active ADD COLUMN requested_language text NOT NULL DEFAULT 'en';
ALTER TABLE hk.requests_active ADD COLUMN outcome text;
UPDATE hk.clinics SET settings=jsonb_set(settings,'{languages}','["en","nd","zu","xh","af"]');
-- Existing drafts and configuration history are preserved; new drafts use the five-language schema.
CREATE TABLE hk.interface_preferences(staff_id uuid PRIMARY KEY REFERENCES hk.staff_users(id),language text NOT NULL DEFAULT 'en');
UPDATE hk.interface_preferences SET language='en' WHERE language='sn';
ALTER TABLE hk.interface_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY preference_own ON hk.interface_preferences FOR ALL USING(staff_id=hk.actor()) WITH CHECK(staff_id=hk.actor());
GRANT SELECT,INSERT,UPDATE ON hk.interface_preferences TO healthkey_app;

CREATE TABLE hk.holder_sessions(digest text PRIMARY KEY,capability_hash text NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX holder_expiry ON hk.holder_sessions(expires_at);
ALTER TABLE hk.holder_sessions ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION hk.holder() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('hk.holder',true),'') $$;
CREATE FUNCTION hk.exchange_holder(cap text,sess text,seconds int DEFAULT 1800) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM hk.requests_active WHERE capability_hash=cap AND expires_at>now() AND hard_expires_at>now()) THEN RETURN false; END IF;
 INSERT INTO hk.holder_sessions VALUES(sess,cap,now()+make_interval(secs=>least(greatest(seconds,60),1800)));
 RETURN true;
END $$;
CREATE FUNCTION hk.resolve_holder(sess text,forget boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE cap text; BEGIN
 IF forget THEN DELETE FROM hk.holder_sessions WHERE digest=sess; RETURN NULL; END IF;
 SELECT capability_hash INTO cap FROM hk.holder_sessions WHERE digest=sess AND expires_at>now(); RETURN cap;
END $$;
REVOKE ALL ON FUNCTION hk.exchange_holder(text,text,int),hk.resolve_holder(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.holder(),hk.exchange_holder(text,text,int),hk.resolve_holder(text,boolean) TO healthkey_app;
DROP POLICY request_read ON hk.requests_active;
CREATE POLICY request_read ON hk.requests_active FOR SELECT USING(expires_at>now() AND hard_expires_at>now() AND status IN('new','acknowledged','in_progress') AND (capability_hash=hk.holder() OR EXISTS(SELECT FROM hk.my_staff() s WHERE s.clinic_id=requests_active.clinic_id AND (s.role='intake' OR (s.role='clinician' AND assigned_to=s.id)))));
DROP POLICY request_write ON hk.requests_active;
CREATE POLICY request_write ON hk.requests_active FOR UPDATE USING(expires_at>now() AND hard_expires_at>now() AND EXISTS(SELECT FROM hk.my_staff() s WHERE s.clinic_id=requests_active.clinic_id AND (s.role='intake' OR (s.role='clinician' AND assigned_to=s.id)))) WITH CHECK(EXISTS(SELECT FROM hk.my_staff() s WHERE s.clinic_id=requests_active.clinic_id AND s.role IN('intake','clinician')));
DROP POLICY message_read ON hk.request_messages;
CREATE POLICY message_read ON hk.request_messages FOR SELECT USING(EXISTS(SELECT FROM hk.requests_active r WHERE r.id=request_id AND (r.capability_hash=hk.holder() OR EXISTS(SELECT FROM hk.my_staff() s WHERE s.role='clinician' AND s.clinic_id=r.clinic_id AND r.assigned_to=s.id))));

CREATE TABLE hk.provider_listings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES hk.clinics(id),public_name text NOT NULL,
 categories text[] NOT NULL,area text NOT NULL,public_pathway text NOT NULL,public_address text,protected_location boolean NOT NULL DEFAULT false,
 provider_languages text[] NOT NULL DEFAULT '{}',access_requirements text NOT NULL DEFAULT 'unknown',accessibility text NOT NULL DEFAULT 'unknown',costs text NOT NULL DEFAULT 'unknown',
 timezone text NOT NULL DEFAULT 'Africa/Johannesburg',opens time NOT NULL DEFAULT '00:00',closes time NOT NULL DEFAULT '23:59',days int[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
 identity_checked_at timestamptz,identity_source text NOT NULL DEFAULT 'not_checked',details_confirmed_at timestamptz,
 availability text NOT NULL DEFAULT 'unknown' CHECK(availability IN('accepting','limited','unavailable','unknown')),
 availability_expires_at timestamptz NOT NULL DEFAULT now(),monitored boolean NOT NULL DEFAULT false,pause_reason text NOT NULL DEFAULT '',version int NOT NULL DEFAULT 0,public_approved boolean NOT NULL DEFAULT false,
 CHECK(NOT protected_location OR public_address IS NULL),CHECK(opens<closes)
);
CREATE INDEX provider_lookup ON hk.provider_listings(clinic_id,public_approved);
CREATE TABLE hk.provider_checkins(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id uuid NOT NULL REFERENCES hk.provider_listings(id),actor uuid NOT NULL,digest text UNIQUE NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE TABLE hk.listing_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id uuid REFERENCES hk.provider_listings(id),actor uuid NOT NULL,reason text NOT NULL CHECK(reason IN('hours','contact','availability','accessibility','other')),created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz);
ALTER TABLE hk.provider_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.provider_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.listing_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY listing_read ON hk.provider_listings FOR SELECT USING(public_approved OR hk.is_admin(clinic_id) OR EXISTS(SELECT FROM hk.my_staff() WHERE role='verifier'));
CREATE POLICY listing_write ON hk.provider_listings FOR UPDATE USING(hk.is_admin(clinic_id) OR EXISTS(SELECT FROM hk.my_staff() WHERE role='verifier'));
CREATE POLICY checkin_own ON hk.provider_checkins FOR ALL USING(actor=hk.actor() AND EXISTS(SELECT FROM hk.provider_listings WHERE id=listing_id AND hk.is_admin(clinic_id))) WITH CHECK(actor=hk.actor() AND EXISTS(SELECT FROM hk.provider_listings WHERE id=listing_id AND hk.is_admin(clinic_id)));
CREATE POLICY report_write ON hk.listing_reports FOR INSERT WITH CHECK(actor=hk.actor() AND EXISTS(SELECT FROM hk.my_staff()));
CREATE POLICY report_review ON hk.listing_reports FOR SELECT USING(EXISTS(SELECT FROM hk.my_staff() WHERE role='verifier'));
CREATE POLICY report_resolve ON hk.listing_reports FOR UPDATE USING(EXISTS(SELECT FROM hk.my_staff() WHERE role='verifier'));
GRANT SELECT,UPDATE ON hk.provider_listings TO healthkey_app;
GRANT SELECT,INSERT,UPDATE ON hk.provider_checkins,hk.listing_reports TO healthkey_app;

CREATE TABLE hk.referrals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_request_id uuid,source_clinic_id uuid NOT NULL REFERENCES hk.clinics(id),holder_digest text NOT NULL,
 target_listing_id uuid NOT NULL REFERENCES hk.provider_listings(id),target_clinic_id uuid NOT NULL REFERENCES hk.clinics(id),responsible_staff uuid NOT NULL REFERENCES hk.staff_users(id),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','awaiting_consent','approved','sent','acknowledged','declined','expired','cancelled','completed')),
 purpose text NOT NULL CHECK(purpose IN('private_conversation','health_support','counselling','legal_information','unsure')),
 payload jsonb NOT NULL DEFAULT '{}',snapshot_hash text NOT NULL,version int NOT NULL DEFAULT 0,snapshot_version int NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',terminal_at timestamptz,
 sent_at timestamptz,acknowledged_at timestamptz,acknowledged_by uuid,outcome text,
 dispatch_key uuid,UNIQUE(dispatch_key),CHECK(source_clinic_id<>target_clinic_id)
);
CREATE INDEX referral_queue ON hk.referrals(target_clinic_id,state,expires_at);
CREATE INDEX referral_source ON hk.referrals(source_clinic_id,responsible_staff);
CREATE INDEX referral_expiry ON hk.referrals(expires_at,terminal_at);
CREATE TABLE hk.disclosure_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),referral_id uuid NOT NULL REFERENCES hk.referrals(id) ON DELETE CASCADE,version int NOT NULL,recipient_id uuid NOT NULL,content jsonb NOT NULL,content_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(referral_id,version));
CREATE TABLE hk.consent_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),referral_id uuid NOT NULL,snapshot_hash text NOT NULL,recipient_id uuid NOT NULL,approved_fields text[] NOT NULL,policy_version text NOT NULL DEFAULT 'demo-consent-1',approved_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,withdrawn_at timestamptz);
CREATE TABLE hk.status_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,record_id uuid NOT NULL,organisation_id uuid NOT NULL,actor uuid,event text NOT NULL,outcome text,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE hk.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.disclosure_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.consent_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk.status_events ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION hk.referral_source(cid uuid,actor uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT FROM hk.my_staff() s WHERE s.role='clinician' AND s.clinic_id=cid AND s.id=actor) $$;
CREATE POLICY referral_read ON hk.referrals FOR SELECT USING(holder_digest=hk.holder() OR hk.referral_source(source_clinic_id,responsible_staff) OR (target_clinic_id IN(SELECT clinic_id FROM hk.my_staff() WHERE role='clinician') AND state IN('sent','acknowledged','completed') AND expires_at>now()));
CREATE POLICY referral_create ON hk.referrals FOR INSERT WITH CHECK(hk.referral_source(source_clinic_id,responsible_staff) AND EXISTS(SELECT FROM hk.requests_active r WHERE r.id=source_request_id AND r.assigned_to=hk.actor() AND r.clinic_id=source_clinic_id AND r.status IN('acknowledged','in_progress')) AND EXISTS(SELECT FROM hk.provider_listings p WHERE p.id=target_listing_id AND p.clinic_id=target_clinic_id AND p.public_approved));
CREATE POLICY referral_update ON hk.referrals FOR UPDATE USING(holder_digest=hk.holder() OR hk.referral_source(source_clinic_id,responsible_staff) OR (target_clinic_id IN(SELECT clinic_id FROM hk.my_staff() WHERE role='clinician') AND state IN('sent','acknowledged') AND expires_at>now())) WITH CHECK(true);
CREATE POLICY snapshot_read ON hk.disclosure_snapshots FOR SELECT USING(EXISTS(SELECT FROM hk.referrals r WHERE r.id=referral_id));
CREATE POLICY snapshot_write ON hk.disclosure_snapshots FOR INSERT WITH CHECK(EXISTS(SELECT FROM hk.referrals r WHERE r.id=referral_id AND hk.referral_source(r.source_clinic_id,r.responsible_staff)));
CREATE POLICY consent_read ON hk.consent_receipts FOR SELECT USING(EXISTS(SELECT FROM hk.referrals r WHERE r.id=referral_id AND (r.holder_digest=hk.holder() OR hk.referral_source(r.source_clinic_id,r.responsible_staff))));
CREATE POLICY consent_insert ON hk.consent_receipts FOR INSERT WITH CHECK(EXISTS(SELECT FROM hk.referrals r WHERE r.id=referral_id AND r.holder_digest=hk.holder() AND r.snapshot_hash=consent_receipts.snapshot_hash AND r.target_clinic_id=consent_receipts.recipient_id));
CREATE POLICY consent_update ON hk.consent_receipts FOR UPDATE USING(EXISTS(SELECT FROM hk.referrals r WHERE r.id=referral_id AND (r.holder_digest=hk.holder() OR hk.referral_source(r.source_clinic_id,r.responsible_staff))));
CREATE POLICY status_read ON hk.status_events FOR SELECT USING(organisation_id IN(SELECT clinic_id FROM hk.my_staff()) OR EXISTS(SELECT FROM hk.referrals r WHERE r.id=record_id AND r.holder_digest=hk.holder()));
CREATE POLICY status_insert ON hk.status_events FOR INSERT WITH CHECK(organisation_id IN(SELECT clinic_id FROM hk.my_staff()) OR EXISTS(SELECT FROM hk.referrals r WHERE r.id=record_id AND r.holder_digest=hk.holder()));
GRANT SELECT,INSERT,UPDATE ON hk.referrals,hk.consent_receipts TO healthkey_app;
GRANT SELECT,INSERT ON hk.disclosure_snapshots,hk.status_events TO healthkey_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA hk TO healthkey_app;
REVOKE ALL ON FUNCTION hk.referral_source(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.referral_source(uuid,uuid) TO healthkey_app;
CREATE FUNCTION hk.enforce_referral() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.target_clinic_id<>OLD.target_clinic_id OR NEW.target_listing_id<>OLD.target_listing_id THEN RAISE EXCEPTION 'new_referral_required'; END IF;
  IF NEW.payload<>OLD.payload OR NEW.purpose<>OLD.purpose THEN
   IF OLD.state NOT IN('draft','awaiting_consent','approved') THEN RAISE EXCEPTION 'invalid_transition'; END IF;
   NEW.state:='draft'; NEW.snapshot_version:=OLD.snapshot_version+1;
   UPDATE hk.consent_receipts SET withdrawn_at=now() WHERE referral_id=OLD.id AND withdrawn_at IS NULL;
  END IF;
  IF NEW.state='sent' AND OLD.state<>'sent' THEN
   IF OLD.state<>'approved' OR NEW.expires_at<=now() OR NOT EXISTS(SELECT FROM hk.consent_receipts c WHERE c.referral_id=NEW.id AND c.snapshot_hash=NEW.snapshot_hash AND c.recipient_id=NEW.target_clinic_id AND c.withdrawn_at IS NULL AND c.expires_at>now()) THEN RAISE EXCEPTION 'consent_required'; END IF;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT FROM hk.provider_listings WHERE id=NEW.target_listing_id AND clinic_id=NEW.target_clinic_id) THEN RAISE EXCEPTION 'invalid_recipient'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hk.enforce_referral() FROM PUBLIC;
CREATE TRIGGER referral_guard BEFORE INSERT OR UPDATE ON hk.referrals FOR EACH ROW EXECUTE FUNCTION hk.enforce_referral();
-- Run alongside existing cleanup. Rows disappear from private reads at expiry independently of this job.
ALTER FUNCTION hk.cleanup() RENAME TO cleanup_requests;
CREATE FUNCTION hk.cleanup() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE n int; BEGIN
 n:=hk.cleanup_requests();
 DELETE FROM hk.holder_sessions WHERE expires_at<=now();
 UPDATE hk.referrals SET state='expired',terminal_at=coalesce(terminal_at,now()) WHERE expires_at<=now() AND state NOT IN('completed','cancelled','declined','expired');
 DELETE FROM hk.disclosure_snapshots s USING hk.referrals r WHERE s.referral_id=r.id AND (r.expires_at<=now() OR r.terminal_at<now()-interval '7 days');
 DELETE FROM hk.referrals WHERE expires_at<=now() OR terminal_at<now()-interval '7 days';
 DELETE FROM hk.consent_receipts WHERE approved_at<now()-interval '30 days';
 DELETE FROM hk.status_events WHERE created_at<now()-interval '30 days';
 DELETE FROM hk.provider_checkins WHERE expires_at<now()-interval '1 day';
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION hk.cleanup(),hk.cleanup_requests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION hk.cleanup_requests() FROM healthkey_maintenance;
GRANT EXECUTE ON FUNCTION hk.cleanup() TO healthkey_maintenance;
