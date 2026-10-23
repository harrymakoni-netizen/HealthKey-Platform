-- Bind private sessions to a second secret held only in the current browser view.
ALTER TABLE hk.holder_sessions ADD COLUMN view_digest text;
DROP FUNCTION hk.exchange_holder(text,text,int);
CREATE FUNCTION hk.exchange_holder(cap text,sess text,seconds int,view_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ BEGIN
 IF length(view_hash)<>64 THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT FROM hk.requests_active WHERE capability_hash=cap AND expires_at>now() AND hard_expires_at>now()) AND NOT EXISTS(SELECT FROM hk.referrals WHERE holder_digest=cap AND expires_at>now()) THEN RETURN false; END IF;
 INSERT INTO hk.holder_sessions(digest,capability_hash,expires_at,view_digest) VALUES(sess,cap,now()+make_interval(secs=>least(greatest(seconds,60),1800)),view_hash); RETURN true;
END $$;
CREATE OR REPLACE FUNCTION hk.resolve_holder(sess text,forget boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ DECLARE cap text; BEGIN
 IF forget THEN DELETE FROM hk.holder_sessions WHERE digest=sess; RETURN NULL; END IF;
 SELECT capability_hash INTO cap FROM hk.holder_sessions WHERE digest=sess AND expires_at>now() AND view_digest=current_setting('hk.view',true); RETURN cap;
END $$;
REVOKE ALL ON FUNCTION hk.exchange_holder(text,text,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.exchange_holder(text,text,int,text) TO healthkey_app;
CREATE TABLE hk.creation_contracts(capability_hash text PRIMARY KEY,contract_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE hk.creation_contracts ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION hk.creation_contract(cap text,contract text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ DECLARE prior text; BEGIN
 INSERT INTO hk.creation_contracts VALUES(cap,contract,now()) ON CONFLICT DO NOTHING;
 SELECT contract_hash INTO prior FROM hk.creation_contracts WHERE capability_hash=cap;
 IF prior<>contract THEN RAISE EXCEPTION 'conflicting_submission'; END IF;
END $$;
REVOKE ALL ON FUNCTION hk.creation_contract(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.creation_contract(text,text) TO healthkey_app;
-- A dispatch locks and rechecks the recipient in the same transaction as consent.
CREATE FUNCTION hk.check_dispatch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ DECLARE p hk.provider_listings;tm time;dy int;BEGIN
 IF NEW.state='sent' AND OLD.state<>'sent' THEN
  SELECT * INTO p FROM hk.provider_listings WHERE id=NEW.target_listing_id FOR SHARE;
  tm:=(now() AT TIME ZONE p.timezone)::time;dy:=extract(dow FROM now() AT TIME ZONE p.timezone)::int;
  IF NOT p.monitored OR p.availability<>'accepting' OR p.availability_expires_at<=now() OR tm<p.opens OR tm>=p.closes OR NOT dy=ANY(p.days) THEN RAISE EXCEPTION 'provider_unavailable'; END IF;
  IF NOT EXISTS(SELECT FROM hk.disclosure_snapshots WHERE referral_id=NEW.id AND version=NEW.snapshot_version AND content_hash=NEW.snapshot_hash AND content=NEW.payload AND recipient_id=NEW.target_clinic_id) THEN RAISE EXCEPTION 'consent_required'; END IF;
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hk.check_dispatch() FROM PUBLIC;
CREATE TRIGGER dispatch_guard BEFORE UPDATE OF state ON hk.referrals FOR EACH ROW EXECUTE FUNCTION hk.check_dispatch();
