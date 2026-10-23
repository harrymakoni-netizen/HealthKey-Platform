-- A paused public clinic still needs an administrator to validate its configuration.
DROP POLICY clinic_read ON hk.clinics;
CREATE POLICY clinic_read ON hk.clinics FOR SELECT USING(active OR hk.is_platform() OR hk.is_admin(id));
DROP POLICY service_read ON hk.services;
CREATE POLICY service_read ON hk.services FOR SELECT USING(hk.is_admin(clinic_id) OR hk.is_platform() OR EXISTS(SELECT FROM hk.clinics WHERE id=clinic_id AND active));
