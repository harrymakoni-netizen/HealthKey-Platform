# HealthKey

**Private access to healthcare and support, with consent-controlled referrals.**

HealthKey helps people request sensitive support without creating an account or explaining their needs in a public reception area. Users can communicate with an assigned practitioner, track their request and decide exactly what information may be shared with a receiving organisation.

The project is being developed for a proposed South African pilot, initially focused on young adults aged 18–35 and participating healthcare, counselling and community-support organisations. The current release is a working demonstration using fictional adult scenarios and synthetic provider data. No live clinic pilot, provider partnership or clinical outcome is claimed.

## Try the demonstration

| Link                                                                                | Purpose                                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Public platform](https://healthkey-connect.vercel.app)                             | Request support or reopen a request using its private access code |
| [Staff dashboard](https://healthkey-connect.vercel.app/staff)                       | Reception, assigned practitioners and receiving staff             |
| [Shared-device entry](https://healthkey-connect.vercel.app/c/HK001?kiosk=1)         | Demonstrate kiosk inactivity warnings and session clearing        |
| [GitHub Actions](https://github.com/harrymakoni-netizen/HealthKey-Platform/actions) | Automated verification runs                                       |

Public users do not need an account.

### Admin dashboard — judge access

[Open the admin dashboard](https://healthkey-connect.vercel.app/admin)

- **Email:** `judges@healthkey-connect.test`
- **Password:** `HealthKeyJudges2026!`

These credentials are intentionally public for competition judging and work only in the synthetic HealthKey Connect demonstration. The account can manage the source demo clinic's providers, configuration and staff permissions. It has no platform-owner privileges or routine access to private conversations. Use fictional data only; this is a shared demonstration environment.

Other staff credentials and private access documents remain outside this repository.

**Before presenting:** source and receiving administrators must confirm monitoring and refresh provider availability. Availability deliberately expires; the demo does not silently make an unavailable service appear available.

## The problem

Privacy concerns, stigma and communication barriers can make asking for healthcare or personal support difficult. People may also be unsure which service is suitable, whether their request has been acknowledged, or what information will be passed to another organisation.

HealthKey focuses on this first contact and the handover between services. It supports access and coordination; it does not provide diagnoses, treatment, prescriptions or emergency response.

## How it works

1. **Request support.** Select a general support category and optional communication or provider-language preferences. Review the information before submitting.
2. **Keep the private code.** The platform issues a private access code and a separate reception reference. The reception reference cannot open the private conversation.
3. **Connect with staff.** Reception acknowledges and assigns the request. Only the assigned practitioner can access the source conversation; administrators do not gain routine message access.
4. **Review a referral.** Inspect the intended recipient, purpose, exact fields and expiry. Approve or decline the proposed disclosure. Approval and sending are separate actions.
5. **Track the handover.** The receiving organisation sees only the approved snapshot. Submission, acknowledgement and a staff-confirmed handover remain distinct states.

Use separate browser profiles or private windows for each role. See the [role-by-role demonstration walkthrough](docs/upgrade/DEMO.md).

## Key features

- Anonymous requests, private messaging and request-status tracking.
- Consent-bound referral snapshots; changing shared fields invalidates approval, and changing recipient requires a new referral.
- Separate reception, assigned-practitioner, receiving-provider, administrator and directory-verifier permissions, with clinic-scoped access.
- Provider listings that distinguish identity checks, information freshness, language capability and current availability; deterministic, explainable matching.
- English by default, plus retained Ndebele support, isiZulu, isiXhosa and Afrikaans. Non-English translations await native-speaker and practitioner review. Interface language does not establish a provider's language capability.
- Responsive layouts, keyboard interaction, visible focus and a floating text-enlargement control.
- Quick exit, shared-device clearing and an offline private-display option. Sensitive requests, messages and approvals are never silently queued for later transmission.
- Clinic configuration, service publishing, staff permissions and privacy-preserving aggregate reporting.

## Proposed business model

People requesting support would use HealthKey free of platform charges. Proposed customers include clinics, NGOs, counselling organisations and university or TVET student-health services. Programme sponsors could fund access for under-resourced facilities.

| Proposed charge                 | Scope                                                    |
| ------------------------------- | -------------------------------------------------------- |
| R2,500 per month                | One site, with up to 10 staff accounts                   |
| R6,500 per month                | Up to three sites within one organisation                |
| R2,000 once off per site        | Configuration, onboarding and initial training           |
| R15,000 per site for six months | Sponsored single-site subscription, excluding onboarding |

These are planning assumptions for customer validation, not current revenue or signed agreements. HealthKey's proposed model does not sell personal information or charge referral commissions. Gauteng is the proposed starting location, subject to suitable partners and pilot approval.

## Technology stack

| Area                   | Technologies                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Application            | Next.js 16.4 App Router, React 19.3, TypeScript, Node.js 24                                                      |
| Interface              | HTML/CSS, Tailwind CSS 4, Inter typography, Lucide React                                                         |
| Database               | PostgreSQL, node-postgres (`pg`), SQL migrations, transactions and row-level security                            |
| Hosted authentication  | Better Auth in a separate database schema; public staff sign-up disabled                                         |
| Local authentication   | Supabase Auth / GoTrue and the Supabase JavaScript client                                                        |
| Validation and privacy | Zod, Node.js cryptography, scoped database logins, HttpOnly sessions and no-store private APIs                   |
| Offline and updates    | Web app manifest, Service Worker, approved public-asset caching and five-second polling while visible and online |
| Infrastructure         | Vercel, separate Neon Postgres database, Docker for local services                                               |
| Quality and delivery   | Vitest, Playwright/Chromium, axe-core, TypeScript checks, ESLint, Prettier and GitHub Actions                    |

## Run locally

Requirements: **Node.js 24, npm and a running Docker engine**. The local setup script expects Docker's Unix socket at `/var/run/docker.sock`. Use only synthetic data.

```sh
git clone https://github.com/harrymakoni-netizen/HealthKey-Platform.git
cd HealthKey-Platform
npm ci
node scripts/local.mjs
npm run db:setup
npm run build
```

The scripts provision local PostgreSQL and Supabase Auth containers, generate ignored environment files and seed synthetic clinics and staff. Local login details are written to `.local/DEMO-ACCESS.md`; they are separate from hosted demo accounts.

Keep cleanup running in one terminal:

```sh
node --env-file=.env.local --import tsx scripts/cleanup.ts --watch
```

Start the application in another terminal:

```sh
npm start
```

Open **http://localhost:3000**. Staff sign-in is at `/staff`; administration is at `/admin`. For hosted configuration, consult [.env.example](.env.example) and the [operations guide](docs/upgrade/OPERATIONS.md). Never commit real environment values, credentials or database dumps.

## Verification

With the local services, cleanup worker and application running:

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
PLAYWRIGHT_CHROMIUM_EXECUTABLE=bundled npm run test:e2e
```

On Linux, Playwright may also require system dependencies; use `npx playwright install --with-deps chromium` where appropriate. An installed `/usr/bin/chromium` is used by default when the executable override is omitted.

Run API/database tests and browser tests **sequentially**: expiry fixtures deliberately change local state. Integration tests enforce a loopback database and demo mode. Never point them at a real clinic database.

Recorded verification includes 38 unit/API tests and six browser scenarios, with hosted checks covering the request-to-referral journey and layouts at 320, 375, 390, 768, 1024 and 1440 pixels, landscape, enlarged text, offline behaviour and kiosk clearing. The floating control also passed hosted keyboard and responsive checks. See [verification details](docs/upgrade/TESTING.md) and [current CI runs](https://github.com/harrymakoni-netizen/HealthKey-Platform/actions). Automated accessibility checks do not establish WCAG compliance.

## Current limitations and pilot requirements

- **Synthetic data only.** Providers are fictional; identity checks in the demo are synthetic fixtures.
- **Hourly background deletion is unresolved.** Neon Functions are unavailable for this project. Daily fallback cleanup and cleanup on application traffic are configured. Expiry is enforced independently, but deletion during inactivity can lag. A supported, observed hourly scheduler is required before real data is authorised.
- **Hosted staff MFA and recovery require implementation and review.** Local Supabase MFA tests do not establish hosted MFA.
- **Translations need native-speaker and practitioner review**, including suitability of the retained Ndebele interface for the intended users.
- **External SMS, email and calls are disabled.** External provider check-ins are explicitly simulated; core request, messaging, authentication and referral operations use the backend and database.
- Independent security/privacy review, manual screen-reader and physical mobile-keyboard testing, verified local service pathways, safeguarding, backups, monitoring and operational ownership remain pilot requirements. No legal, security or accessibility certification is claimed.

## Repository and documentation

```text
src/app/              Pages, layouts, styles and API route handlers
src/components/       Public journey, staff operations and reusable UI
src/i18n/             Translation catalogues and English fallbacks
src/lib/              Shared contracts, validation and matching
src/server/           Authentication, business operations and database access
database/             SQL migrations and synthetic configuration
public/               Public assets, web app manifest and Service Worker
scripts/              Local setup, fixture seeding and maintenance tooling
tests/                Unit, API and browser verification
docs/upgrade/         Documentation for the current platform
```

- [API contracts](docs/upgrade/API.md)
- [Privacy and data boundaries](docs/upgrade/PRIVACY.md)
- [Demonstration walkthrough](docs/upgrade/DEMO.md)
- [Deployment, retention and rollback](docs/upgrade/OPERATIONS.md)
- [Release evidence and limitations](docs/upgrade/RELEASE.md)

The upgraded demonstration uses its own Vercel project and Neon database. The [original HealthKey deployment](https://healthkey-omega.vercel.app) remains separate. Earlier documents under `docs/` and archived baseline tests describe that earlier release; `docs/upgrade/` governs the current implementation.
