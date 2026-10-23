# Data and privacy boundaries

## Roles and storage

| Store                      | Purpose                                                                                | Access/retention                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `organizations`, `clinics` | Organization and versioned clinic settings                                             | Platform configuration; clinic admin limited to own clinic                                            |
| `services`                 | Ordered categories and reviewed labels/help in three languages                         | Published sanitized menu is public; changes require clinic admin                                      |
| `staff_users`              | Provider identity ID, clinic, operational role and permitted services                  | Staff identity only; no youth account table                                                           |
| `requests_active`          | Category, preference, random display code, hashed capability, lifecycle and assignment | Intake in own clinic; clinician assignment/service scope; max 24h                                     |
| `request_messages`         | Optional 500-character patient/staff messages and retry nonces                         | Same request/clinic access; immediately deleted on completion/cancellation; cascade on expiry cleanup |
| `request_events`           | Minimal staff lifecycle events                                                         | Deleted by cascading request deletion                                                                 |
| `config_versions`          | Published settings/wording snapshot, actor and version                                 | Clinic admin; contains configuration, never requests                                                  |
| `audit`                    | Administrative/security action type, staff actor and time                              | Clinic/platform scope; 30-day demo retention                                                          |
| `analytics_daily`          | Counts by day/category/outcome                                                         | No request ID; reports suppress small cells                                                           |
| `wait_histogram`           | Aggregate frequency per wait duration/day                                              | No request IDs; API returns median only above thresholds                                              |
| `usage_daily`              | Unlinked language, accessibility and available offline-display counts                  | No category or capability; suppressed reports                                                         |
| `throttles`                | Temporary counters                                                                     | Short-lived, hashed session/email or clinic key; no raw email/IP                                      |
| `maintenance`              | Last successful cleanup                                                                | Health check reports only ready/degraded                                                              |

All application tables live in `hk`. Services use same-clinic composite foreign keys for request/service and request/assignee relationships. Sensitive data and staff requests are never available through a public database API. The `healthkey_app` login has no superuser/BYPASSRLS capability. Each transaction sets its verified staff identity locally, resetting at transaction end. Only narrowly scoped SECURITY DEFINER operations implement anonymous create/resolve/cancel, completion and aggregation. Their search paths are fixed and EXECUTE is revoked from PUBLIC.

The `healthkey_maintenance` login can execute cleanup and health functions only; it cannot browse active requests or modify configuration. Migration credentials stay with migration/onboarding tooling and are not required by the web application. Production providers must support these separate roles or an equivalent separation.

## Lifecycle

`new → acknowledged → in_progress → completed`. Assignment is a separate action with optimistic versioning. Public cancellation works only while `new`. New requests expire after 60 minutes by default. Acknowledgement extends their operational window to the hard maximum of 24 hours from creation; it cannot extend that maximum.

Completion/cancellation disappears from active reads immediately. Cleanup runs every minute and atomically aggregates and deletes terminal or expired records and their linked events. Expiry filters protect queues independently of cleanup. A database advisory lock prevents overlapping cleanup double-counting. A cleanup delay over five minutes makes new submissions fail closed and health return 503. Job failure can delay physical deletion; alerts and recovery are required, not a promise of exact-minute deletion during outages.

Row deletion does **not** erase backups, WAL, replicas or provider logs immediately. Confirm their retention and restore behavior before approving the privacy notice. Restore into an isolated environment, purge expired data, check authorization, then reconnect traffic. Configuration/auth backups should be governed separately from ephemeral requests where provider capabilities permit.

## Device behavior

Public state is in React memory. Selection never enters a URL, document title, localStorage, sessionStorage or IndexedDB. A 100-bit cryptographically random private access code (20 base32 characters) derives a 43-character capability using SHA-256. The code and capability remain in memory; only the capability’s SHA-256 hash reaches the database. The code can reopen progress and messages while the request is active. It is a bearer credential: anyone holding it can access that conversation. The reference code is six random hexadecimal characters and reveals no clinic/service/time.

After submit, service and preference are dropped from the public view/state; only reference, private code and capability remain for receipt and conversation access. Clear discards these. A public throttle cookie contains only a random, ten-minute abuse-control identifier. Staff tokens are in HttpOnly, SameSite=Strict cookies, Secure on HTTPS, with a 30-minute browser lifetime. Staff membership is checked on every API call. MFA is mandatory when `REQUIRE_MFA=true`.

Kiosk inactivity defaults to 90 seconds with a warning 20 seconds before reset and repeatable extensions. The neutral receipt has a 40-second window (20 seconds plus an extension warning), preserving time to retain the reference. Hidden kiosk tabs and page restoration reset transient state. The operating system may still create screenshots or task previews; kiosk device management and physical privacy placement are required.

The service worker caches only neutral public documents, static assets and sanitized clinic config. It does not intercept mutation requests, staff/admin pages or private APIs. It never registers Background Sync. Cached menus allow a previously loaded device to operate offline. A cold first visit needs physical/staff assistance. Offline events are not stored for later telemetry either; offline usage counts explicitly undercount.

## Optional request conversations

The user-authorized demo extension permits short-lived text communication, not a retained clinical history. Messages are limited to 500 characters, 12 sends per minute per sender/request and 100 per conversation. Read access is capped at 90 per minute per sender/request. Staff permissions match the active request queue; admin/platform roles do not gain access. Nonces make an explicit retry idempotent. Messages and private access codes never enter URLs, analytics or application logs.

Copying a revealed private code is an explicit personal-device action. Kiosks do not offer clipboard copying. Clear-screen removes the in-memory code, messages and draft but does not cancel the server request. Offline messages are never queued for automatic transmission. Completion/cancellation triggers immediate message deletion; expiry prevents reads immediately, then scheduled cleanup deletes the parent and messages. Backup/provider retention limitations above still apply. Users may type identifying information despite the UI guidance; clinic privacy notices and safeguarding procedures must address this before real use.

## Delivery ambiguity

An HTTP timeout can follow a committed request. The same in-memory capability provides idempotency and an explicit delivery check. No automatic POST replay occurs. The interface states that delivery may have succeeded and offers a check, explicit retry, or direct display. Clearing during an in-flight request prevents its later response from restoring the prior person's state; a request already received by the server may still remain until cancelled or expired.

## Analytics

No third-party analytics, session replay, advertising identifiers or hidden profiles. Reports omit the current calendar day. Underlying daily service/outcome cells below five suppress the report, including totals; fixed 7/30/90-day ranges avoid arbitrary event-level filters. Usage has its own unlinked daily counters. Counts do not provide formal differential privacy: clinic-context re-identification and report inference need independent review before release. Raw aggregate histograms are not exposed through public or staff APIs.

## Logging and security review

API errors expose allowlisted codes, never raw PostgreSQL errors or bodies. No selection values are logged. Cleanup logs only an aggregate deleted count; service health exposes no identifiers. Hosting/access/auth logs require separate provider review. Local GoTrue logs contain staff authentication events only.

React escapes clinic strings; strict schemas reject unknown public keys; origin validation protects cookie-authenticated mutations; cookies, body limits, RLS, bounded rate counters and server-controlled expiry provide separate controls. CSP restricts sources, disallows framing and objects, and currently permits inline scripts/styles for Next.js hydration. Development-only eval permission is absent from production. A nonce/hash CSP is a possible hardening item for independent review, not a claimed control in this build.

No claim of production security, legal certification or WCAG conformance is made. Safeguarding categories route to staff; HealthKey provides no diagnosis, triage algorithm or emergency response guarantee.
