CREATE TABLE hk.request_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES hk.requests_active(id) ON DELETE CASCADE,
 sender text NOT NULL CHECK(sender IN ('patient','staff')),
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 500),
 nonce uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,nonce)
);
ALTER TABLE hk.request_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_read ON hk.request_messages FOR SELECT USING(EXISTS(SELECT FROM hk.requests_active r WHERE r.id=request_id));
GRANT SELECT ON hk.request_messages TO healthkey_app;

CREATE FUNCTION hk.conversation(cid text, capability text, rid uuid, message text DEFAULT NULL, message_nonce uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE r hk.requests_active; who text; messages jsonb;
BEGIN
 IF rid IS NULL THEN
   who:='patient';
   SELECT q.* INTO r FROM hk.requests_active q JOIN hk.clinics c ON c.id=q.clinic_id
     WHERE q.capability_hash=capability AND c.code=cid AND c.active FOR UPDATE OF q;
 ELSE
   who:='staff';
   SELECT q.* INTO r FROM hk.requests_active q JOIN hk.clinics c ON c.id=q.clinic_id
     WHERE q.id=rid AND c.active AND EXISTS(SELECT FROM hk.my_staff() s WHERE s.clinic_id=q.clinic_id
       AND (s.role='intake' OR (s.role='clinician' AND (q.assigned_to=s.id OR q.service_id=ANY(s.service_ids))))) FOR UPDATE OF q;
 END IF;
 IF r.id IS NULL OR r.expires_at<=now() OR r.hard_expires_at<=now() THEN RETURN NULL; END IF;
 IF NOT hk.throttle('room-read:'||who||':'||r.id,90,60) THEN RAISE EXCEPTION 'rate_limited'; END IF;
 IF message IS NOT NULL THEN
   IF r.status NOT IN ('new','acknowledged','in_progress') THEN RAISE EXCEPTION 'request_closed'; END IF;
   IF message_nonce IS NULL OR char_length(btrim(message)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_message'; END IF;
   IF NOT EXISTS(SELECT FROM hk.request_messages WHERE request_id=r.id AND nonce=message_nonce AND sender=who) THEN
     IF NOT hk.throttle('room-send:'||who||':'||r.id,12,60) THEN RAISE EXCEPTION 'rate_limited'; END IF;
     IF (SELECT count(*) FROM hk.request_messages WHERE request_id=r.id)>=100 THEN RAISE EXCEPTION 'conversation_full'; END IF;
     INSERT INTO hk.request_messages(request_id,sender,body,nonce) VALUES(r.id,who,btrim(message),message_nonce);
   END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'sender',m.sender,'body',m.body,'created_at',m.created_at) ORDER BY m.id),'[]'::jsonb)
 INTO messages FROM hk.request_messages m WHERE m.request_id=r.id AND r.status IN ('new','acknowledged','in_progress');
 RETURN jsonb_build_object('public_code',r.public_code,'status',r.status,'expires_at',r.expires_at,'messages',messages);
END $$;
REVOKE ALL ON FUNCTION hk.conversation(text,text,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.conversation(text,text,uuid,text,uuid) TO healthkey_app;

CREATE FUNCTION hk.clear_conversation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
BEGIN
 IF NEW.status IN ('completed','cancelled') THEN DELETE FROM hk.request_messages WHERE request_id=NEW.id; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hk.clear_conversation() FROM PUBLIC;
CREATE TRIGGER clear_terminal_messages AFTER UPDATE OF status ON hk.requests_active FOR EACH ROW EXECUTE FUNCTION hk.clear_conversation();
