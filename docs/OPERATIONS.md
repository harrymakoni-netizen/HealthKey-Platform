# Deployment and maintenance

## Environments

Local development and this demonstration contain synthetic data only. Provision distinct hosted demo/staging and production databases/auth projects. Never connect pull-request previews to production. The local Docker services are a development harness, not an Internet-facing production Supabase deployment.

Use a managed PostgreSQL/Supabase instance and Vercel account owned by the pilot operator. Confirm processing regions, Zimbabwe legal/privacy requirements, provider subprocessors, auth/access logs, database backups and PITR retention before selecting the production plan. The synthetic demo is deployed at https://healthkey-omega.vercel.app using the Vercel and Supabase Free/Hobby plans. Real clinic operation remains subject to the pilot gates below.

## Database setup

Apply `database/001_schema.sql` through `009_conversations.sql` in numeric order using an operator migration account. Keep a migration ledger in the release process. `scripts/setup.ts` is a **local-only synthetic seed harness**; it refuses non-local/non-demo targets and must not be used for a clinic pilot.

Create strong, independent credentials for `healthkey_app` and `healthkey_maintenance`; provision them securely using the provider's SQL/admin workflow. The app role must have no superuser/BYPASSRLS privilege, no membership in the owner/maintenance roles and no ability to change schema ownership. Do not expose the `hk` schema through Supabase's public Data API. Use the application API for access.

The provider may install pgcrypto in an `extensions` schema instead of `public`. Migration 001 explicitly calls `public.gen_random_bytes`. Before applying it, confirm the extension schema and update that qualified call if necessary. Do not widen SECURITY DEFINER search paths to user-writable schemas.

Create the initial clinic/settings/menu and platform operator through reviewed migrations or operator tooling. Clinic settings require `communication_options`, the three enabled language codes (`en`, `sn`, `nd`), name, hours, retention values and review flag. The demo seed is the schema example, not clinically validated production content.

## Staff onboarding

Provision staff in Supabase Auth with the operator's supported admin tools. Confirm work identity out of band; do not enable public signup. Insert the returned auth user UUID into `hk.staff_users` with clinic, role, display name and permitted service UUIDs. Set a secure initial credential/reset process; the application does not send email or invite messages itself.

Set `REQUIRE_MFA=true` for clinic use. First sign-in enrolls a TOTP authenticator when needed, then verifies it before permitting staff APIs. Ensure an accessible MFA recovery/onboarding process exists before activation. Removing staff access sets `active=false` immediately; every staff API checks current membership. Configure provider session revocation/password recovery; access tokens can remain valid until provider expiry, while local role revocation takes effect at the application boundary.

## Environment variables

| Variable                   | Used by                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Runtime app login (`healthkey_app`), TLS-enabled managed connection             |
| `MAINTENANCE_DATABASE_URL` | Runtime cleanup-only login                                                      |
| `AUTH_URL`                 | Managed Supabase `https://PROJECT.supabase.co/auth/v1`                          |
| `AUTH_API_KEY`             | Provider publishable/anon key required by the managed gateway; server-side here |
| `APP_BASE_URL`             | Exact origin, e.g. `https://demo.example.org`; no trailing slash                |
| `CRON_SECRET`              | At least 32 random bytes; scoped to cleanup requests                            |
| `DEMO_MODE`                | `true` only for clearly synthetic environments                                  |
| `REQUIRE_MFA`              | `true` before a clinic pilot                                                    |
| `MIGRATION_DATABASE_URL`   | Operator scripts only; do not add to deployed web runtime                       |
| `AUTH_ADMIN_KEY`           | Local onboarding/operator tooling only; do not add to deployed web runtime      |

Never commit or paste credentials into tickets/chat. Match functions and database regions. Confirm pooled connection behavior supports a single connection for each transaction and its transaction-local identity setting. Preserve TLS certificate verification.

## Vercel preparation

For Supabase, set `DATABASE_CA_CERT` to the PEM in `database/supabase-root.crt`. Its source is Supabase's dashboard certificate link, published in their official Studio configuration: `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. SHA-256 fingerprint: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`; expiry 26 April 2031. The driver verifies both the chain and hostname. Do not replace this with `rejectUnauthorized:false`. Review provider certificate rotation before renewal.

`scripts/deploy-setup.mjs` is an explicitly bound operator bootstrap for a newly provisioned synthetic Supabase project. It requires `HK_EXPECTED_PROJECT`, `DEMO_MODE=true`, separate generated role credentials, provider operator credentials and synthetic staff credentials. It applies migrations, seeds reviewed demo configuration, provisions staff and installs database cleanup. It is not the normal build command. Remove bootstrap and provider administrator credentials from the deployed runtime after setup; preserve them only in the operator's secret store.

1. Link a new project to the reviewed repository in the intended team. This implementation does not require Sites hosting.
2. Configure server-only runtime variables independently for preview/staging/production. Use synthetic data in previews. Do not expose database keys with `NEXT_PUBLIC_` prefixes.
3. Use Node.js 24 and the committed package lock; build with `npm ci && npm run build`.
4. The hosted synthetic demo uses Supabase `pg_cron` to run `SELECT hk.cleanup()` every minute; Vercel Hobby does not support this interval. Verify the `healthkey-cleanup` database job and recent successful runs before opening public access. `vercel.json` therefore contains no Vercel cron. An operator can also call the protected cleanup endpoint with `CRON_SECRET` for recovery.
5. Set HTTPS/custom domain, confirm security headers, and add `/api/health` to the operator's uptime monitoring. Alert on 503 or missed cleanup, not on request body contents.
6. Run all checks and smoke-test a staged production build with synthetic scenarios; verify expiry/deletion from the actual provider, not just the UI.
7. Only promote after the pilot checklist is signed off. Never claim provider backups are immediately erased by row deletion.

This repository uses JSON Vercel configuration for Next.js and London function placement. Cleanup runs inside Supabase, not Vercel Cron. No Git-triggered production deployment is enabled. CI should run checks on reviewed source and require deployment checks or an approved protected release environment; secrets must never reach untrusted pull-request code or published artifacts.

## Runbooks

**Cleanup failure:** health changes to degraded; creation fails after five minutes without cleanup. Keep staff on direct assistance/physical selector workflows. Restore database/scheduler connectivity, invoke cleanup with the maintenance credential, verify the backlog has been removed and health is ready, then resume. Never increase TTL to hide an incident.

**Database restore:** restore to an isolated environment. Run cleanup before exposing APIs. Verify RLS, staff membership, deletion, clinic config and translations. Do not restore old request data into a live queue.

**Rollback:** keep the last tested application build. Prefer backward-compatible migrations; rolling back the application must not revive expired requests or revert revocations. Do not blindly reverse retention migrations. Validate health and one synthetic workflow after rollback.

**Kiosk:** managed browser/device profile, app URL ending `?kiosk=1`, no autofill or browser password saving for the public flow, physical privacy placement, accessible hardware height, a tested physical selector and staff-assisted alternative. Disable OS/app-preview screenshots through device management where possible. The web app cannot promise to control operating-system captures.

**Translations:** use the clinic admin editor to review service wording in all three languages, then preview each language and publish. Core UI copy is externalized in `src/i18n/messages.ts` and must be reviewed through the release process. Record named community/clinical reviewers outside the app; the review checkbox alone is not evidence.

**Routine maintenance:** review dependency/security updates, run regression suites, test expired/closed record deletion, monitor failed jobs, review staff permissions and conduct periodic kiosk reset checks. Keep logs free of payloads; do not enable session replay or request-body error capture.

## Pilot gates still requiring people/provider access

- Zimbabwe clinical and safeguarding wording, clinic hours and physical fallback procedure.
- Community validation of Shona and Ndebele, plus English comprehension testing.
- Real young-person usability sessions, including disability/accessibility participants and appropriate consent/safeguarding.
- Manual screen-reader and physical Android/iOS/tablet/kiosk checks; formal accessibility assessment before claiming conformance.
- Independent security and privacy review, including Supabase roles, data residency, backup/PITR, logs, rate limits and report inference risks.
- Hosted scheduler/restore rehearsal, monitoring ownership, incident response contacts and staff training.

Current limits: daily opening/closing hours rather than a weekday/holiday calendar; one clinic per staff membership; no self-service password recovery UI (provider/operator workflow); no automatic QR/physical-selector generator; offline counts intentionally incomplete. No external security/legal/accessibility certification or real-device pilot has been performed.

## Conversation migration

For existing synthetic deployments, `scripts/migrate-conversations.mjs` applies migration 009 with an operator-only `HK_MIGRATION_URL`. Run in a controlled migration environment with verified database TLS. If using a staged Vercel build for network access, remove the temporary privileged variable and restore the normal build command before building the release; never promote the migration build. Remove that temporary deployment after verification. New local setup applies 009 automatically. Existing six-character desk references cannot be converted into private access codes; create a new request to demonstrate re-entry.
