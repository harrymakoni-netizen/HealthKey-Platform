CREATE FUNCTION hk.set_request_language(cap text,lang text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ BEGIN
 IF lang NOT IN('en','nd','zu','xh','af') THEN RAISE EXCEPTION 'invalid_language'; END IF;
 UPDATE hk.requests_active SET requested_language=lang WHERE capability_hash=cap AND expires_at>now();
END $$;
CREATE FUNCTION hk.withdraw_request(cap text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ BEGIN
 UPDATE hk.requests_active SET status='cancelled',completed_at=now(),version=version+1 WHERE capability_hash=cap AND expires_at>now() AND status IN('new','acknowledged','in_progress');
 UPDATE hk.referrals SET state='cancelled',terminal_at=now(),version=version+1 WHERE holder_digest=cap AND state NOT IN('completed','cancelled','declined','expired');
 UPDATE hk.consent_receipts SET withdrawn_at=now() WHERE referral_id IN(SELECT id FROM hk.referrals WHERE holder_digest=cap);
END $$;
CREATE FUNCTION hk.finish_request(rid uuid,expected int,result text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE r hk.requests_active; BEGIN
 SELECT * INTO r FROM hk.requests_active WHERE id=rid FOR UPDATE;
 IF r.version<>expected OR r.status<>'in_progress' OR r.expires_at<=now() OR NOT EXISTS(SELECT FROM hk.my_staff() WHERE role='clinician' AND clinic_id=r.clinic_id AND id=r.assigned_to) THEN RAISE EXCEPTION 'access_denied'; END IF;
 IF result NOT IN('support_provided','handover_confirmed','user_left') THEN RAISE EXCEPTION 'outcome_required'; END IF;
 UPDATE hk.requests_active SET status='completed',completed_at=now(),outcome=result,version=version+1 WHERE id=rid;
END $$;
REVOKE ALL ON FUNCTION hk.set_request_language(text,text),hk.withdraw_request(text),hk.finish_request(uuid,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.set_request_language(text,text),hk.withdraw_request(text),hk.finish_request(uuid,int,text) TO healthkey_app;
-- Replace the existing narrow room function: reception is no longer a participant.
CREATE OR REPLACE FUNCTION hk.conversation(cid text,capability text,rid uuid,message text DEFAULT NULL,message_nonce uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE r hk.requests_active;who text;messages jsonb; BEGIN
 IF rid IS NULL THEN
  who:='patient'; SELECT q.* INTO r FROM hk.requests_active q JOIN hk.clinics c ON c.id=q.clinic_id WHERE q.capability_hash=capability AND (cid IS NULL OR c.code=cid) AND c.active FOR UPDATE OF q;
 ELSE
  who:='staff'; SELECT q.* INTO r FROM hk.requests_active q JOIN hk.clinics c ON c.id=q.clinic_id WHERE q.id=rid AND c.active AND EXISTS(SELECT FROM hk.my_staff() s WHERE s.role='clinician' AND s.clinic_id=q.clinic_id AND s.id=q.assigned_to) FOR UPDATE OF q;
 END IF;
 IF r.id IS NULL OR r.expires_at<=now() OR r.hard_expires_at<=now() THEN RETURN NULL; END IF;
 IF NOT hk.throttle('room-read:'||who||':'||r.id,90,60) THEN RAISE EXCEPTION 'rate_limited'; END IF;
 IF message IS NOT NULL THEN
  IF r.status NOT IN('new','acknowledged','in_progress') THEN RAISE EXCEPTION 'request_closed'; END IF;
  IF message_nonce IS NULL OR char_length(btrim(message)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_message'; END IF;
  IF NOT EXISTS(SELECT FROM hk.request_messages WHERE request_id=r.id AND nonce=message_nonce AND sender=who) THEN
   IF NOT hk.throttle('room-send:'||who||':'||r.id,12,60) THEN RAISE EXCEPTION 'rate_limited'; END IF;
   IF (SELECT count(*) FROM hk.request_messages WHERE request_id=r.id)>=100 THEN RAISE EXCEPTION 'conversation_full'; END IF;
   INSERT INTO hk.request_messages(request_id,sender,body,nonce) VALUES(r.id,who,btrim(message),message_nonce);
  END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'sender',m.sender,'body',m.body,'created_at',m.created_at) ORDER BY m.id),'[]') INTO messages FROM hk.request_messages m WHERE m.request_id=r.id AND r.status IN('new','acknowledged','in_progress');
 RETURN jsonb_build_object('public_code',r.public_code,'status',CASE WHEN r.status='new' THEN 'submitted' WHEN r.status='cancelled' THEN 'withdrawn' WHEN r.status='acknowledged' AND r.assigned_to IS NOT NULL THEN 'assigned' ELSE r.status END,'expires_at',r.expires_at,'messages',messages,'organisation',(SELECT name FROM hk.clinics WHERE id=r.clinic_id),'staff_role','assigned_practitioner');
END $$;
-- Existing completion endpoint uses the same stricter boundary.
CREATE OR REPLACE FUNCTION hk.complete_request(rid uuid,expected_version int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
BEGIN PERFORM hk.finish_request(rid,expected_version,'support_provided'); RETURN true; END $$;

CREATE OR REPLACE FUNCTION hk.exchange_holder(cap text,sess text,seconds int DEFAULT 1800) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$ BEGIN
 IF NOT EXISTS(SELECT FROM hk.requests_active WHERE capability_hash=cap AND expires_at>now() AND hard_expires_at>now()) AND NOT EXISTS(SELECT FROM hk.referrals WHERE holder_digest=cap AND expires_at>now()) THEN RETURN false; END IF;
 INSERT INTO hk.holder_sessions VALUES(sess,cap,now()+make_interval(secs=>least(greatest(seconds,60),1800))); RETURN true; END $$;
