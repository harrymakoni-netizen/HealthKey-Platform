# Data map and privacy boundaries

| Data | Purpose | Access | Retention / deletion |
|---|---|---|---|
| Public listing fields, approved address, coarse area, provider languages, costs/access/schedule | Browse and explain matches | Approved public API; owner/admin or verifier edits | Versioned current directory; no protected addresses stored on protected listings |
| Identity source/date, details confirmation, separate capacity state/expiry | Scoped, dated directory claims | Public approved fields; verifier/owner authority | Live information becomes unknown/stale independently of retention |
| Request service/preference/language, opaque ID/reference, assignment and lifecycle | Route a request | Holder; reception gets minimal routing; assigned practitioner gets operational content | New request default 60m; acknowledged maximum 24h; closure/expiry denies content immediately, cleanup deletes rows |
| Private access digest and creation contract digest | Credential verification and idempotency | Narrow server functions only | Request expiry/cleanup; creation contract maximum 24h |
| Session digest, view-secret digest and capability digest | Short private session | Narrow exchange/resolve functions | 30m personal, 120s kiosk; revoked on clear; view secret destroyed on clear/reload |
| Message text and retry nonce | In-app practical communication | Holder and assigned practitioner only | Deleted by trigger on closure/withdrawal; expiry denies access immediately and cleanup cascades |
| Referral fields, recipient, purpose, expiry, versions | Propose one exact disclosure | Source responsible practitioner and holder; recipient only after dispatch with current permission | Content purged at expiry or within 7d of terminal state |
| Immutable snapshot content/hash | Exact disclosure evidence | Same scoped referral relationship; recipient receives approved version only | Same content purge as referral |
| Consent receipt: hash, recipient, field names, policy, approval/withdrawal/expiry | Bound approval evidence | Holder/source; no private credential stored in receipt | Demo 30d; configurable through reviewed migrations/policy |
| Content-free referral terminal outcomes, minimal status events | Truthful closure/expiry and operational evidence | Scoped holder/source/recipient status; no narrative | Demo 30d |
| Staff/provider identity and membership | Authenticate and authorise staff | Auth store and own clinic administration; no default content access | Reviewed operator account lifecycle; membership checked each call |
| Throttle counters | Bound attempts and message sends | Narrow database functions | Expiring counters; hashed keys, no raw public IP stored by application |
| Grouped service/outcome/usage counts | Operational reports | Clinic admin; small groups/current day suppressed | Existing aggregate policy; no message/private-code linkage |

## Device and session clearing

Only a validated interface-language value is saved in a non-sensitive cookie. No private choice, draft, code, referral or message enters localStorage, sessionStorage or IndexedDB. Service worker caching is allowlisted to neutral public shell, static assets and sanitised clinic configuration. Private APIs, staff pages, referrals and credentials are not cached. No background sync or automatic replay exists.

Quick exit clears React state and the in-memory view secret immediately and requests server revocation using keepalive. If offline, the server cannot be contacted; the destroyed view secret still prevents cookie-only reuse. A web app cannot erase browser history, OS screenshots, remote monitoring or messages in other apps. Shared devices require a managed browser and physical privacy arrangements.

## Referrals and cancellation

Approval binds recipient, purpose, exact fields/values, expiry and snapshot hash. Edits invalidate consent. A new recipient requires a new referral and approval. Dispatch locks/rechecks consent and recipient capacity. Cancellation blocks future access; already viewed/copied information cannot be recalled. A cancelled or expired handover is never described as acknowledged. Consent and audit metadata can itself be sensitive and requires partner review.

## Hosting and live-use dependencies

Infrastructure may process IP addresses and staff identity. No account requirement is not a promise of total anonymity. TLS is verified; application logs omit bodies, credentials and query strings. Better Auth logging is disabled. No general AI service receives private text. Separate database roles limit application, auth and maintenance privileges; no universal operator content bypass exists.

Provider encryption, backup retention, PITR and restore permissions require independent review. Deletion from active tables does not immediately erase backups. Restore into isolation, rerun expiry/content purge, reapply membership revocations and verify policies before admitting traffic. No unattended restoration into live service is authorised by this demo.

All five language versions are unapproved for live service until native speakers and practitioners validate meaning. The demo involves fictional adults. Minors, urgent routes, safeguarding, referral agreements, clinical record transfer and legal retention require qualified partner policies. No external messaging integration is enabled.
