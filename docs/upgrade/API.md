# Upgrade API

All endpoints below are under `/api`. Responses are `Cache-Control: no-store`. Mutation requests require JSON and the exact configured `Origin`. Strict Zod schemas reject unknown fields. No sensitive values belong in URLs or logs.

| Method | Route | Behaviour |
|---|---|---|
| GET | `/v2/directory` | Approved public fields, separate verification/freshness/availability; protected addresses absent |
| POST | `/v2/match` | Explicit category, provider language, coarse area and accessibility filters; deterministic reasons/questions and ruleset |
| POST | `/v2/request` | `{clinic,nonce,service_id?,communication_pref,language,kiosk?}`; returns reception reference and grouped 160-bit private code; repeated nonce with the same contract is idempotent |
| POST | `/v2/session` | `{private_code,kiosk?}`; exchanges private code for scoped HttpOnly cookie; reference alone is rejected |
| POST | `/v2/clear` | Revokes holder session and removes cookie |
| POST | `/v2/private/renew` | Explicit kiosk extension; rotates the view-bound cookie for 120 seconds and revokes the previous token; no automatic polling extension |
| GET/POST | `/v2/private/room` | Own status/messages/referrals; POST `{message,nonce}`; 500 characters, 12 sends/minute, 100 messages/request |
| POST | `/v2/private/withdraw` | Withdraws request, clears messages, cancels active referrals |
| GET/POST | `/v2/private/referrals` | Own previews/statuses; POST `{id,version,hash,action:approve/decline/cancel}` |
| GET | `/v2/queue` | Minimal reception routing, assigned practitioner requests, scoped referrals |
| PATCH | `/v2/requests/{id}` | `{action,version,assignee?,outcome?}`; explicit acknowledge/assign/start/complete |
| GET/POST | `/v2/requests/{id}/messages` | Assigned practitioner only; receiving staff have no source-chat access |
| GET/POST | `/v2/referrals` | Scoped handovers or proposal `{request_id,target_id,purpose,payload,nonce}` |
| PATCH | `/v2/referrals/{id}` | `{version,action,payload?,purpose?,nonce?,outcome?}`; edit/request_consent/dispatch/acknowledge/decline/cancel/complete |
| GET | `/v2/providers` | Own administration or approved operational directory; verifier reports |
| PATCH | `/v2/providers/{id}` | Expected version, availability/expiry, monitoring, hours/timezone, language/access/cost fields; identity confirmation restricted to verifier |
| POST | `/v2/providers/{id}/checkin` | Authenticated owner gets a ten-minute, one-use confirmation credential; external SMS is simulated |
| POST | `/v2/providers/{id}/confirm` | `{token,version}` confirms only the authorised listing |
| POST | `/v2/providers/report` | `{listing_id,reason}`; no incident narratives |
| GET/PUT | `/v2/preferences` | Non-sensitive staff interface preference; saved Shona normalises to English |

Private-session creation and access use `X-HK-View`, a random second secret held only in current JavaScript memory. Its digest binds the HttpOnly cookie. Clear or reload destroys this secret; cookie replay without it fails. Neither credential is put in browser storage. Integration examples must preserve this header within a single active synthetic session.

Referral payload is an explicit subset of `category`, `communication_preference`, `requested_language`, `note` (maximum 240 characters). Source chat, identity, exact location and medical history have no referral fields. The receiving API returns this approved snapshot only. Acknowledgement is not an appointment or guaranteed capacity. Completion records an explicit operational outcome and its confirmation source.

Existing `/auth/*`, `/admin/*`, `/platform/*`, `/internal/cleanup`, `/health` conventions remain. Legacy staff queue/actions delegate to the stricter upgrade operations. Legacy capability endpoints remain for historical request access but private conversations enforce assigned-practitioner scope. Database RLS rechecks active membership on every transaction.

Typical errors: 400 validation; 401 missing/expired session; 403 wrong role/origin; 404 unavailable or inaccessible record; 409 stale version/invalid transition/consent or provider unavailable; 410 expired referral; 429 bounded abuse controls; 503 dependency/maintenance failure. Errors never echo submitted text.
