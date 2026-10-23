# Upgrade inventory — 23 October 2026

Source: existing Next.js 16.4 / React 19.3 application. Repository AGENTS.md and installed Next route-handler documentation read. No Git repository metadata is present. Original release archive and Vercel binding are preserved privately under .local/baseline. Working directory now links only to healthkey-connect.

| Feature | Baseline status and evidence | Upgrade |
|---|---|---|
| Anonymous requests/idempotency | Verified: 49 baseline unit/API tests pass against PostgreSQL17/GoTrue | Preserve, add server-generated 160-bit credentials and scoped session exchange |
| Reception reference | Verified separate from capability by API/browser tests | Preserve; deny reception private messages |
| Private key | Working but 100 bits | Increase new credentials to 160 bits; historical keys remain readable |
| Queue/auth | Verified role/clinic tests; MFA test passes | Assigned practitioner only; minimal reception rows |
| Messages | Verified bidirectional API and browser tests | Preserve short-lived store; use HttpOnly holder session |
| Languages | English/Shona/Ndebele; draft non-English | English/Ndebele/isiZulu/isiXhosa/Afrikaans; migrate active Shona preference |
| Kiosk/offline | Existing browser tests and service-worker allowlist | Extend clearing to sessions/consent; no offline disclosure queue |
| Referral/consent/directory/matching | Absent | Persisted additive models, consent hashes, recipient scope, deterministic matcher |
| Responsive admin | Partial; old table layouts | Reflow all new journeys and administration; review six widths |

Baseline browser run recorded separately. Existing public React state is in memory; no sensitive browser persistence. Auth provider sessions use HttpOnly cookies. Provider API, database, service worker and logging code inspected. Existing request state names will be mapped to submitted/withdrawn in the upgrade UI rather than destructively renaming historical records.

## Implementation order
1. Add migrations, sessions, strict roles, provider data and referral transitions.
2. Integrate public/private/staff/provider flows using existing API/auth/component primitives.
3. Centralise five-language text and review all responsive states.
4. Execute database/unit/browser/privacy tests and document limitations.
5. Bootstrap an isolated synthetic database/auth environment, deploy only healthkey-connect, verify live; preserve old production.
