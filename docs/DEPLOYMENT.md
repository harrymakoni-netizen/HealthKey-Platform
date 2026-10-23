# Hosted synthetic demonstration

- Public URL: https://healthkey-omega.vercel.app
- Staff: https://healthkey-omega.vercel.app/staff
- Administration: https://healthkey-omega.vercel.app/admin
- Vercel project: https://vercel.com/hjm-technologies/healthkey
- Project ID: `prj_5oOajdHxWB3cOBVj4KHwmxjsNKWo`
- Previous release: `dpl_7AJp4B4cVYrAck1qDvfPupefsxS2`.
- Released conversation update on 10 October: `dpl_AKuJ9xNiCYTx6vxRt69TAYC9s8SF`, READY, production target; promoted to the public URL.
- Source: `/workspace/healthkey`, uploaded directly; no Git commit or automatic Git deployment is configured.
- Vercel build: Next.js 16.4, Node.js 24, conversation release build duration 53 seconds (42 seconds reported by Vercel build).
- Hosted services: Supabase Free, project `gpgjciongqmwrvkvckfj`, London; Vercel Hobby with functions in London.

## Executed verification

The final staged deployment passed ten API checks before promotion. The public URL then passed the same checks. A real Chromium browser verified mobile rendering, all three language choices, anonymous submission/clearing, a separate staff session, acknowledgement, start, completion and logout. Evidence is in `hosted-verification.json`, `hosted-browser-verification.json` and `hosted-mobile.png`.

The bootstrap verified TLS using Supabase's published root certificate, tested the application and maintenance database roles separately, and observed an actual automatic cleanup execution. Supabase `pg_cron` runs `SELECT hk.cleanup()` every minute, independently of Vercel Hobby's cron limits. Health returned HTTP 200/ready after promotion.

Only nine required runtime variables remain configured: `DATABASE_URL`, `MAINTENANCE_DATABASE_URL`, `DATABASE_CA_CERT`, `AUTH_URL`, `AUTH_API_KEY`, `APP_BASE_URL`, `CRON_SECRET`, `DEMO_MODE`, `REQUIRE_MFA`. Provider administrator/database-owner credentials and bootstrap passwords were removed from the project before building the released deployment. The Marketplace resource's automatic environment-variable connection was detached to prevent privileged defaults from being injected; the database itself remains active and the app connects through its explicitly configured restricted roles. Three temporary setup/failed deployments were removed after release.

Hosted staff credentials are saved privately in `.local/HOSTED-DEMO-ACCESS.md`. That file and all secret files are excluded from deployment uploads and the source archive. They differ from the local Docker demo credentials.

## Operational boundaries

This is an operational synthetic demo, not a real-clinic launch. Shona/Ndebele clinical review, independent privacy/security/accessibility review, provider account settings, staff MFA/recovery and real-device/user acceptance remain pilot gates. The demo uses password-only staff access; real clinic settings require MFA. Provider signup/recovery policies must be reviewed before clinic use. Free-tier quotas and Supabase inactivity pausing are not a clinic availability guarantee.

Runtime error-log inspection found no error entries at the time of verification. External uptime alerts, log drains and an incident-response service were not configured by this task. See OPERATIONS.md for ongoing monitoring, backup/restore, scheduler and retention responsibilities.

## Private-code and conversation release — 10 October 2026

The released build adds private-code re-entry, progress and short-lived two-way communication. The public URL passed all 12 API checks in `hosted-verification.json`. The staged run passed messaging and authorization, then its completion assertion encountered 404 because scheduled cleanup had already deleted the request. The check now correctly accepts either a terminal response with no messages or 404 after deletion; it rejects further sends in both states.

The migration deployment `dpl_F4MtAUBGhJ58k6ZrQay24mo41cDp` was removed after release. The release contains only the nine runtime variables and no migration credential. Runtime error-log inspection returned no entries. `npm audit --omit=dev` reported zero production dependency vulnerabilities; the build reported five high-severity development dependency findings, which are not covered by that production-only result.

The public Chromium walkthrough passed private-code re-entry after clearing, messages in both directions, acknowledged/in-progress updates, completion clearing and empty local/session storage. See `hosted-conversation-verification.json` and the hosted conversation screenshots. The first browser attempt overlapped API logout using the same demo account and could not open the staff request; rerunning the browser journey alone passed. Run authentication-dependent hosted checks sequentially.
