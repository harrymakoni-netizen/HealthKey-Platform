# API reference

All responses are JSON and `Cache-Control: no-store`. Mutation bodies require `Content-Type: application/json` and an exact `Origin` matching `APP_BASE_URL`, except the bearer-authenticated cleanup endpoint. Unknown public fields are rejected. Service-submission schemas reject names, contact information, symptoms and free text. The separate optional conversation endpoint accepts bounded text. Limit: 32 KiB per JSON body.

## Public

| Method | Path                                       | Contract                                                                                    |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| GET    | `/api/public/clinics/{code}/config`        | Sanitized clinic metadata, settings and active services/labels; no draft/staff/request data |
| POST   | `/api/public/clinics/{code}/requests`      | `{service_id: UUID, communication_pref: enum                                                | null, capability: 43-character base64url}`→ 201`{public_code, expires_at, status}` |
| POST   | `/api/public/requests/resolve`             | `{capability}` → current reference/expiry/status; no service is returned                    |
| POST   | `/api/public/requests/{publicCode}/cancel` | `{capability}` → cancelled status, only if pending; code alone grants nothing               |
| POST   | `/api/public/clinics/{code}/metrics`       | `{metric: language                                                                          | accessibility                                                                      | offline, value: allowlisted enum}`; no request/capability/service linkage |
| GET    | `/api/health`                              | `{status: ready                                                                             | degraded}` with 200/503; no identifiers                                            |

Clients generate a random 20-character base32 private access code (100 bits) before explicit submission. SHA-256 of the normalized code, encoded as base64url, yields the 43-character capability. Keep it **only in memory**, including for an explicit retry or delivery check; never log it or put it in a URL. The server stores only its hash and returns the same active reference on repeated submissions with the same capability. After cleanup it cannot be resolved or recovered.

Communication enums: `spoken`, `writing`, `pictures`, `sign`, `support`; the clinic may expose a subset. Expiry is calculated server-side. Public endpoint validates active clinic, clinic-local active service, configured preference and opening hours in `Africa/Harare`. It fails closed when cleanup health is stale. No public queue listing exists.

Submission example:

```json
{
  "service_id": "a clinic-local UUID from config",
  "communication_pref": "writing",
  "capability": "a base64url SHA-256 digest of a fresh private access code"
}
```

An HTTP failure may follow a committed request. Ask the person to check delivery or explicitly retry. Do not store an outbox or register Background Sync. Clear-screen removes local state and is distinct from cancellation of a server request.

## Staff authentication and operations

| Method | Path                       | Contract                                                                                                        |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`          | `{email,password}`; verifies through Supabase Auth, sets HttpOnly cookie and returns MFA requirement/factor IDs |
| POST   | `/api/auth/mfa/enroll`     | Authenticated staff setup; returns TOTP QR/setup secret for the current enrollment only                         |
| POST   | `/api/auth/mfa`            | `{factor: UUID,code: six digits}`; challenges/verifies the factor and replaces session cookie                   |
| POST   | `/api/auth/logout`         | Clears cookie and requests provider logout                                                                      |
| GET    | `/api/staff/me`            | Authorized staff record and clinic display metadata                                                             |
| GET    | `/api/staff/queue`         | Role-scoped active requests, eligible staff and refresh time                                                    |
| PATCH  | `/api/staff/requests/{id}` | `{action,version,assignee?}`; acknowledge/assign/start/complete                                                 |

Assignment requires intake role and a same-clinic active operational staff member. Lifecycle transitions require the current version. A conflicting update returns 409 rather than silently overwriting another staff action. Admin/platform roles do not inherit intake access. Public code, service label, preference and age are visible only in the permitted active queue.

The client refreshes every five seconds when visible. On network loss, hidden-tab transitions, logout or authorization failure, the sensitive queue is cleared. In-flight responses are checked against the current view generation to avoid restoring stale data after clearing.

## Clinic administration

| Method | Path                         | Contract                                                                  |
| ------ | ---------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/admin/config`          | Own clinic's settings, service translations and current version           |
| PUT    | `/api/admin/config/draft`    | `{version,settings,services[]}`; strict complete draft → `{revision}`     |
| POST   | `/api/admin/config/publish`  | `{version,revision}`; must match the exact draft previewed                |
| GET    | `/api/admin/staff`           | Existing own-clinic staff permissions                                     |
| PATCH  | `/api/admin/staff/{id}`      | `{role,active,service_ids[]}`; no self-change or platform-role escalation |
| GET    | `/api/admin/analytics?days=7 | 30                                                                        | 90` | Suppressed or finalized service/outcome counts and aggregate median wait |
| GET    | `/api/admin/usage`           | Suppressed or unlinked usage counts for 30 completed calendar days        |
| GET    | `/api/admin/audit`           | Latest 50 administrative change records, no request contents              |

Settings: display name, available languages, configured communication options, opening/closing times, after-hours text, kiosk idle seconds, unacknowledged TTL, urgent option and local translation review flag. Current constraints are explicit in `src/lib/contracts.ts`. Service entries contain UUID, active flag, order, icon and English/Shona/Ndebele label/help maps. Versions snapshot published configuration; a newer draft invalidates an earlier preview.

These configuration endpoints consolidate the specification's separate service-list/update routes so a reviewed publication applies atomically across menu, translations and settings. The UI never publishes individual partially edited labels.

## Platform administration and cleanup

| Method   | Path                          | Contract                                                                       |
| -------- | ----------------------------- | ------------------------------------------------------------------------------ |
| GET/POST | `/api/platform/organizations` | List organizations or create `{name}`                                          |
| GET/POST | `/api/platform/clinics`       | List configuration-only clinic records or create `{name,code,organization_id}` |
| PATCH    | `/api/platform/clinics/{id}`  | `{active}`; pause/restore public clinic access                                 |
| GET/POST | `/api/internal/cleanup`       | `Authorization: Bearer CRON_SECRET`; execute narrow maintenance function       |

New clinics start paused and inherit the existing configured service taxonomy as a draft starting point. A provisioned clinic administrator can configure a paused clinic. Production public access requires reviewed wording. Staff onboarding remains an operator task in the auth provider; the clinic admin manages existing staff access.

## Errors

`{error: "allowlisted_code"}`. Typical statuses: 400 invalid request/selection; 401 sign-in required/invalid credentials; 403 role/MFA/origin denied; 404 unavailable clinic/request; 409 invalid transition, non-pending cancellation or conflicting version; 413 oversized body; 415 wrong content type; 429 rate limit; 503 service/retention unavailable. Unhandled database/provider failures map to a neutral error; query text and submitted values are never returned.

## Short-lived conversations

- `POST /api/public/clinics/{code}/conversation`: `{capability, message?: {message: string, nonce: UUID}}`. Omitting `message` reads progress; including it explicitly sends. Returns `{public_code,status,expires_at,messages:[{id,sender,body,created_at}]}` with no service selection. The private access code itself is never submitted.
- `GET /api/staff/requests/{id}/messages`: same response, authenticated and scoped to authorized operational staff.
- `POST /api/staff/requests/{id}/messages`: `{message: string, nonce: UUID}`; same scoped response.

Text is trimmed, 1–500 characters. Unknown fields are rejected. The nonce supports explicit retry without duplication. Reads/sends are throttled; closed requests reject sends with 409; expired or inaccessible requests return 404. Completion/cancellation clears messages immediately. The queue includes `message_count` for staff awareness. Polling occurs every five seconds while visible/online; messages are never automatically submitted on reconnect. The six-character desk reference cannot authorize conversation access.
