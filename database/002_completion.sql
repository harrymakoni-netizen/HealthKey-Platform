-- Terminal updates cannot return rows through an active-only SELECT policy.
-- This narrow function checks permissions and concurrency, and returns no request content.
CREATE OR REPLACE FUNCTION hk.complete_request(rid uuid,expected_version int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE r hk.requests_active; s hk.staff_users; BEGIN
 SELECT * INTO s FROM hk.my_staff();
 SELECT * INTO r FROM hk.requests_active WHERE id=rid FOR UPDATE;
 IF r.id IS NULL OR s.id IS NULL OR r.clinic_id<>s.clinic_id OR r.status<>'in_progress' OR r.version<>expected_version OR r.expires_at<=now() OR r.hard_expires_at<=now() THEN RETURN false; END IF;
 IF NOT(s.role='intake' OR (s.role='clinician' AND (r.assigned_to=s.id OR r.service_id=ANY(s.service_ids)))) THEN RETURN false; END IF;
 UPDATE hk.requests_active SET status='completed',completed_at=now(),version=version+1 WHERE id=rid;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION hk.complete_request(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.complete_request(uuid,int) TO healthkey_app;
