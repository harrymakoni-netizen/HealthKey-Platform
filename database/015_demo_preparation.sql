-- Explicit, synthetic-fixture-only preparation. Never changes requests or messages.
CREATE FUNCTION hk.prepare_demo() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=hk,pg_temp AS $$
DECLARE n int;
BEGIN
 UPDATE hk.provider_listings SET availability='accepting',monitored=true,
   availability_expires_at=now()+interval '2 hours',details_confirmed_at=now(),
   pause_reason='',opens='00:00',closes='23:59',days=ARRAY[0,1,2,3,4,5,6],version=version+1
 WHERE identity_source IN('synthetic_fixture_only','synthetic_verifier_review') AND ((id='a1111111-1111-4111-8111-111111111111' AND clinic_id='11111111-1111-4111-8111-111111111111')
    OR (id='b2222222-2222-4222-8222-222222222222' AND clinic_id='22222222-2222-4222-8222-222222222222'));
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION hk.prepare_demo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hk.prepare_demo() TO healthkey_app;
