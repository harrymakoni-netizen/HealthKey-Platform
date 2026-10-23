# Verification and pilot acceptance

Evidence recorded on 9–10 October 2026 against the local production build, real PostgreSQL 17 and Supabase Auth, using synthetic clinic data. This is engineering verification, not certification or approval for real clinic operation.

## Executed checks

| Check                       | Result                                | Scope                                                                                                            |
| --------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Production build            | Passed                                | Next.js compilation and TypeScript validation                                                                    |
| TypeScript and ESLint       | Passed                                | Strict source checks                                                                                             |
| Vitest                      | 49 passed                             | 13 domain/localization, 25 API/database, 1 real TOTP, 2 TLS configuration and 8 conversation/access-code tests                    |
| Playwright Chromium         | 18 passed                             | Public, staff, administration, private-code re-entry, messaging, offline, delivery ambiguity, kiosk, accessibility and layout journeys             |
| Production dependency audit | 0 reported vulnerabilities            | `npm audit --omit=dev`; point-in-time dependency metadata, not a security assessment                             |
| Visual inspection           | Completed                             | Captured desktop welcome, 320px mobile review and staff workspace; screenshots in this directory                 |
| Throttled-load sample       | 2.64 seconds to visible start control | One local production run at 150ms latency, 1.6Mbps down, 4x CPU slowdown; approximately 147KB encoded JavaScript |

Run `npm test` before `npm run test:e2e`, not concurrently. Database tests deliberately alter clinic state and expiry. See README for prerequisites. GitHub Actions configuration is included but has not been executed on a remote runner.

The final runs above passed after correcting an aggregate-test SQL alias and a browser-test locator that also matched Next.js's route announcer. Earlier failing or interrupted runs are not counted as passes. Development service-worker/HMR behavior was corrected by registering the service worker only in production. No test result is inferred from code generation.

## Specification acceptance traceability

| Criterion                                | Evidence and remaining boundary                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01: anonymous service selection       | Public browser journey reaches services without sign-in.                                                                                                                                          |
| AC-02: no selection in URL               | Browser assertion plus implementation review: selection is memory/POST only.                                                                                                                      |
| AC-03: kiosk reset/Back                  | Inactivity reset, extension, submission/clear/reload and Back/restoration tests. Physical browser/OS task previews still need device-policy review.                                               |
| AC-04: cross-clinic isolation            | API read/write denial, scoped roles and RLS tests against real PostgreSQL. Queue refresh uses authenticated five-second polling, so there is no separate realtime channel authorization boundary. |
| AC-05: reject free text in service submissions | Strict request schemas and API tests for unknown keys, PII and foreign/disabled services. User-authorized conversation extension accepts bounded text through a separate endpoint.                                                                                                          |
| AC-06: expiry                            | Expired rows disappear before cleanup; cleanup then physically removes them.                                                                                                                      |
| AC-07: completion and deletion           | Lifecycle/version checks, linked-event deletion, idempotent cleanup, aggregates and restricted maintenance-role tests. Hosted cron execution verified; backup/restore behavior still requires operator review.                        |
| AC-08: no offline auto-sync              | Offline/reconnect test observes zero submissions; cached offline reload has no sensitive cache/outbox; lost-response resolution creates no second POST.                                           |
| AC-09: accessible buttons/focus          | Axe checks public screens/dialog and staff workspace; keyboard-only selection and focus movement tested. Full manual assistive-technology coverage remains pending.                               |
| AC-10: 200% browser zoom                 | Automated 200% root text enlargement and 320px reflow passed. Actual browser zoom across supported browsers is a separate **pending manual check**.                                               |

Other executed boundaries include missing authentication, disallowed origins, capability guessing, idempotency, role revocation, assigned-clinician access, admin/intake separation, paused-clinic administration, stale configuration preview rejection, small-cell suppression, sufficiently large aggregate median, rate limiting and fail-closed behavior after a stalled cleanup job.

## Manual checks required before the Zimbabwe pilot

- Have Zimbabwean community and clinical reviewers validate every English, Shona and Ndebele string, service icon, safeguarding category and waiting instruction. Catalogue completeness tests do not verify translation quality.
- With representative young users, measure unaided request completion and comprehension. The under-one-minute objective has not been validated with first-time users.
- Test VoiceOver/Safari, TalkBack/Chrome and NVDA/Firefox or Chrome: headings, labels, live announcements, validation, dialogs, MFA, focus return and session warnings.
- Test actual 200% browser zoom, 400% reflow where applicable, forced colors, reduced motion, large text and keyboard-only operation throughout public, staff and administrative screens.
- Test lower-powered Android devices, iOS, tablets and the intended managed kiosk: touch targets, keyboard appearance, orientation, browser Back/forward, task switching, idle reset and the next user's session.
- Walk through slow/unstable network, cold offline visit, cached offline visit, power loss and restart. Train staff on direct display and the physical selector; neither should imply a request was electronically delivered.
- Verify hosted TLS, MFA/recovery, cookie settings, roles, rate limits, logs, cleanup scheduling, alert delivery, backups/PITR, restore and access revocation with an independent security/privacy reviewer.
- Test staff operational capacity and queue refresh under realistic load; rehearse after-hours, urgent assistance, clinic closure and incident response.

No WCAG, legal or production-security compliance claim is made. Automated accessibility passes cover selected states, not every success criterion. The performance sample is not a field benchmark, service-level guarantee or load test.

## Milestone status

Foundation/design, public requests, staff operations, privacy/offline/kiosk controls, administration and synthetic-demo verification are implemented. Pilot hardening remains open for human review, provider configuration and real-device/real-user acceptance above. Hosted synthetic deployment is now complete; see DEPLOYMENT.md and the hosted verification JSON files for the additional executed checks. See OPERATIONS.md for deployment gates and current functional limits.

## Hosted deployment checks

The deployed build additionally passed two database TLS configuration unit tests, strict TypeScript and lint checks. Ten hosted API checks passed against the final staged deployment and again against the public production URL. These covered provider-backed authentication, secure cookies, clinic isolation, admin separation, public validation and the complete request lifecycle. The bootstrap observed the one-minute database scheduler updating cleanup state and verified both restricted database roles. See `hosted-verification.json` for the recorded public target and checks.

## Conversation extension verification

The complete 49-test unit/API suite passed on 10 October after fixing test-fixture isolation: previous-day synthetic aggregates had caused three reporting tests to fail on the first rerun. The fix clears only the local test clinics’ reporting fixtures behind the existing local-demo guard. Production reporting logic was unchanged.

The full 18-browser suite passed on 9 October. After final kiosk clipboard and response-ordering polish, the six conversation browser scenarios were rerun on 10 October: code re-entry and two-way lifecycle; short-reference rejection; axe/mobile reflow; no offline automatic sending; explicit retry without duplicate messages; kiosk timeout/private-code clearing. Screenshots `patient-conversation.png`, `staff-conversation.png` and `mobile-conversation.png` were visually reviewed. Automated checks do not replace the manual acceptance requirements above.

The 10 October public release additionally passed 12 hosted API checks and the real-browser conversation walkthrough. Hosted authentication checks must run sequentially because logout can invalidate another test using the same demo account. See DEPLOYMENT.md for the staged cleanup assertion correction and hosted evidence.
