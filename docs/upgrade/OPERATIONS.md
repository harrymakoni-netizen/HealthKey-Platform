# Deployment, maintenance and rollback

## Isolation

Original Vercel project: `healthkey` / `prj_5oOajdHxWB3cOBVj4KHwmxjsNKWo`, public URL https://healthkey-omega.vercel.app. Do not deploy the upgrade there. Its previous Vercel binding and release archive are preserved privately under `.local/baseline`.

New project: `healthkey-connect` / `prj_nTmWvZqD8wowftdNLDNsLChCexO0`. New Neon Marketplace resource: `healthkey-connect-demo`. The original Supabase database and staff accounts are untouched. New auth is Better Auth with sign-up disabled in the web app, separate `hk_auth` schema and restricted `healthkey_auth` login. Application login uses `healthkey_app`; deletion uses `healthkey_maintenance`. Owner credentials are temporary bootstrap inputs only.

## Setup and release

Provision a new free database. Copy the environment-variable names from `.env.example`, supplying credentials securely. Never commit `.env` or `.local`. Set `APP_BASE_URL` to the new canonical domain. Staff authentication is same-origin password/session flow; no third-party OAuth callback or outbound email is configured. Original Supabase MFA remains available for the local legacy provider; the new demo permits password-only access. Review a maintained MFA setup before real clinic use.

Apply migrations 001–014 in numeric order on an empty synthetic database, or 010 onward to an isolated copy of the old schema. No production data copy is authorised. Use an operator migration ledger. `scripts/bootstrap-connect.mjs` is a guarded operator-only setup for this NEW demo and must never run with original database credentials. It creates synthetic fixtures and seven independent demo identities.

Temporary build command: bootstrap, optional scheduler setup, then build. After setup succeeds, remove `HK_CONNECT_MIGRATION_URL`, `HK_DEMO_PASSWORD`, `HK_AUTH_PASSWORD`, `HK_APP_PASSWORD`, `HK_MAINTENANCE_PASSWORD`, `HK_EXPECTED_NEON_PROJECT` and temporary `NEON_API_KEY`. Restore normal `npm run build`, create a fresh staged production deployment without privileged variables, test it, then promote that tested build. Remove temporary setup deployments after release.

## Retention

The required hourly job executes `SELECT hk.cleanup()` through a restricted maintenance role. `functions/retention.mjs` and `scripts/configure-connect-scheduler.mjs` configure a Neon scheduled function where the project region/account supports it. The function accepts only Neon trigger invocations and contacts the bearer-protected maintenance endpoint, without private content. The scheduler must be observed executing; configuration alone is not proof.

Traffic also triggers a bounded once-per-minute purge as a supplementary safeguard. This is not a substitute for an hourly scheduler during inactivity. `hk.healthy()` fails after a 70-minute cleanup gap; private content expiry checks are enforced independently of the purge. Scheduler availability, free-tier quotas and alerts require operational ownership. See the final verification record for whether the remote scheduler was actually provisioned and observed.

**Current demo limitation:** Neon accepted the scoped management key, but its function deployment API returned HTTP 404, “platform functions not available for this project”. No scheduled Neon function was created. Vercel Hobby permits only daily cron jobs; the release therefore configures a bearer-protected fallback at 02:17 UTC plus traffic-triggered cleanup. The required hourly purge during inactivity is **not satisfied**. Expired records remain inaccessible independently, but physical deletion can lag until traffic or the daily job. Do not put real user data into this demo. Before a clinic pilot, provision an authorised scheduler supporting hourly execution, use the existing protected cleanup endpoint, observe successful runs, and alert on gaps. The temporary Neon management key has been removed from Vercel; its creator can revoke it in Neon.

## Rollback / restore

Keep the previous new-environment deployment and migration checkpoint. To roll back the UI, promote that tested new-project deployment; never repoint the old project. Do not drop referral/consent tables as an automatic rollback: this would destroy consent evidence. For an incompatible database rollback, stop new intake, restore the NEW demo backup into isolation, run cleanup and revocation reconciliation, verify tenant policies, then switch only the new environment. Never restore deleted private content into an accessible service.

Before live use: willing service partner, approved local urgent/support pathways, explicit clinical-record boundary, verified language content, independent privacy/security review, actual assistive-technology/device testing, staff MFA/recovery, retention/backup policy, monitoring, incident ownership and provider onboarding agreements. Nothing in this synthetic demo certifies legal compliance or clinical benefit.
