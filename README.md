# HealthKey Connect — private access and consent-controlled handovers

An upgrade of the existing HealthKey Next.js application for an adult, synthetic competition demonstration. The original deployment at https://healthkey-omega.vercel.app is preserved. The upgraded application is linked only to Vercel project `healthkey-connect` (`prj_nTmWvZqD8wowftdNLDNsLChCexO0`) and a separately provisioned Neon database.

## What works

- Anonymous private-conversation requests; server-generated 160-bit access codes, separate reception references, idempotent creation and HttpOnly private-session exchange. Sessions also require a secret kept only in the active browser view.
- Reception acknowledgement and assignment; only the assigned practitioner can open private messages. Clinic administrators, directory verifiers and platform operators have no routine conversation access.
- Immutable disclosure snapshots, exact hash-bound consent receipts, versioned approval, separate dispatch, receiving-organisation acknowledgement and explicit handover outcomes. Changing fields invalidates consent; changing destination requires a new referral. Cancelling blocks future recipient retrieval.
- Public provider directory, separate identity/details/availability records, one-use authenticated check-in, reports to verifiers, protected-location controls and deterministic explainable matching. Availability expires independently from weekly details confirmation.
- English default plus IsiNdebele, isiZulu, isiXhosa and Afrikaans. Shona is removed from active choices; legacy preferences normalise to English. Translation strings are centralised; every non-English translation requires native-speaker and practitioner review. Interface language never establishes provider language capability.
- Offline general private display without an outbox, shared-kiosk clearing, quick exit, responsive operational cards, draft/preview/publish clinic configuration, staff access management and suppressed aggregate reports.

All providers and scenarios are fictional adults. No clinical benefit, partnership, WCAG certification or production-security certification is claimed. External SMS/email/calls are disabled; the weekly external check-in is explicitly simulated. Core database/auth/referral operations are real.

The hosted demo currently uses daily scheduled cleanup plus cleanup on application traffic. Hourly background deletion is blocked because Neon Functions are unavailable for this project; this is an unmet live-pilot requirement, not a completed security control. Expired private records are denied independently. See the operational limitations before using this software with any real data.

## Local setup

Node.js 24, npm and Docker are required. Use only synthetic data.

```sh
npm ci
node scripts/local.mjs
npm run db:setup
# Separate terminal: local retention job
node --env-file=.env.local --import tsx scripts/cleanup.ts --watch
# Separate terminal: production app
npm run build
npm start
```

Visit http://localhost:3000. Local credentials are generated in `.local/DEMO-ACCESS.md`. Accounts use the existing local Supabase Auth service: intake, clinician, admin, receiving, secondadmin, verifier, platform and legacy other, all at `@healthkey.test`. The hosted upgrade uses independent Better Auth identities at `@healthkey-connect.test`; credentials are in the private `.local/CONNECT-DEMO-ACCESS.md`.

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Run database tests and browser tests sequentially. Integration tests require loopback database URLs and demo mode; never target a live clinic. System Chromium is the default; configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if needed. Historical baseline suites are archived under `tests/baseline/` because the upgraded permissions and languages intentionally supersede them.

## Architecture and operations

The original Next.js 16.4 / React 19.3 / strict TypeScript / PostgreSQL stack is retained. Existing API/auth/domain/UI primitives and the original request/message tables are reused. New business routes live in `src/server/upgrade.ts`; SQL migrations 010–014 are additive. Application, authentication and maintenance use separate restricted database logins. Local Supabase authentication remains supported; the new hosted demo uses maintained Better Auth inside its own database because a new free Supabase resource is unavailable. Public sign-up is disabled. Hosted staff MFA enforcement remains a live-pilot gate; local Supabase MFA is retained and tested.

See [release evidence and limitations](docs/upgrade/RELEASE.md), [API](docs/upgrade/API.md), [privacy/data map](docs/upgrade/PRIVACY.md), [walkthrough](docs/upgrade/DEMO.md), [deployment and rollback](docs/upgrade/OPERATIONS.md), [inventory](docs/upgrade/INVENTORY.md) and [verification](docs/upgrade/TESTING.md). Historical documents in `docs/` describe the previous release; the `docs/upgrade/` documents govern this version.
