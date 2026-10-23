# HealthKey Connect — demo release, 23 October 2026

Public URL: https://healthkey-connect.vercel.app

Staff: https://healthkey-connect.vercel.app/staff

Administration: https://healthkey-connect.vercel.app/admin

Original URL preserved: https://healthkey-omega.vercel.app (HTTP 200 observed after the new release). No deployment, migration, or test targeted the original project or database.

## Released build

Vercel team `hjm-technologies`; new project `healthkey-connect` / `prj_nTmWvZqD8wowftdNLDNsLChCexO0`. Original upgrade deployment `dpl_KK9UKyNgERQBCcgJifHCQwqhKyyq`, unique URL https://healthkey-connect-hoq24r9va-hjm-technologies.vercel.app. Framework Next.js 16.4 / React 19.3. The supplied workspace had no Git metadata; Git was subsequently initialised for the user's requested source publication. Release builds use normal `npm run build`, with no database-owner bootstrap or management key. Temporary setup deployments were removed.

Independent Neon database `healthkey-connect-demo`; Better Auth uses its own restricted login/schema. Secrets are stored only as Vercel Production secrets. No owner migration URL, demo setup password, role provisioning input or Neon API key remains in the deployment environment. No secrets are included in the source archive. The separately delivered demo-access document contains only synthetic staff credentials.

## What changed

Anonymous general support requests, separate reception/private credentials, view-bound private sessions, assigned-practitioner messaging, explicit request outcomes, provider freshness/availability and protected locations, deterministic matching, immutable consent previews, separate approval/dispatch, recipient-only snapshots, acknowledgement, cancellation and handover outcomes. Existing clinic configuration, service publishing, staff permissions and suppressed analytics are retained.

English is the default; IsiNdebele, isiZulu, isiXhosa and Afrikaans use central translations with English fallbacks. Saved Shona preferences normalise to English; historical labels/records are preserved. All non-English translations are drafts requiring native-speaker and practitioner review. Provider language capability is independent from interface language.

Mobile layouts use wrapping controls and operational cards. Shared-kiosk clearing, explicit server-side session extension, quick exit and offline private display do not create a sensitive outbox. Private APIs use no-store headers. A private session cookie alone is insufficient after the in-memory view secret is destroyed.

## Executed verification

- Optimised Next.js production build, strict TypeScript and ESLint: passed.
- Unit/API suites against a guarded disposable local database: 38 tests passed in four files. Includes cookie rotation/revocation, exact disclosure consent, concurrent cancellation/dispatch, organisation boundaries, stale providers, expiry and scrubbed metadata.
- Local production browser: six scenarios passed.
- New hosted production browser: six scenarios passed. The complete source/recipient journey used real hosted authentication, APIs and database operations; no simulated success response was substituted.
- Staged hosted smoke checks passed before promotion: public directory, staff login/membership, anonymous creation, private access, rejection of short reception references, secure HttpOnly cookies, no-store responses, clear/revocation, and bearer-protected cleanup execution.
- A bounded scan of the final deployment's error-level logs returned no entries during verification; this is not continuous monitoring or a security audit.
- Vercel environment inspection confirmed nine required runtime variables, with temporary privileged setup variables removed. Seven temporary new-project deployments were removed.

Screenshots document rendered reviews. Browser checks cover all six required widths and landscape, keyboard interaction, 200% text enlargement, selected axe scans, Shona preference migration, five-language navigation, offline no-auto-send and kiosk timeout. Physical device keyboards and full manual assistive-technology testing remain pending.

## Operational limitations — read before presenting or piloting

1. **Hourly deletion is unresolved.** Neon accepted the scoped key but returned HTTP 404: “platform functions not available for this project”. Vercel Hobby permits only daily scheduling. A daily 02:17 UTC cleanup fallback and traffic-triggered cleanup are configured; the required hourly purge during inactivity is not met. Expired records are denied independently, but deletion can lag until traffic or the daily job. The cleanup endpoint was executed successfully; no scheduled background execution has yet been observed. Provision a supported hourly scheduler and verify it before real data is authorised.
2. This is a fictional adult competition demo. No real providers, confirmed partnerships, clinical outcomes, appointments or emergency response are implied. Outbound SMS, email and calls remain disabled; the external weekly check-in is explicitly simulated.
3. Hosted staff authentication is password/session based. Strong MFA/recovery, independent penetration/privacy reviews, backup/PITR and retention guarantees, operational alerts, safeguarding and local practitioner approval remain live-pilot gates. Local legacy Supabase MFA is retained and tested; that does not establish hosted MFA.
4. Native-speaker/practitioner review is required for every non-English translation and any live service information. Synthetic provider identity checks are not live verification.
5. Provider availability deliberately expires. Before presenting, source and receiving administrators must confirm monitoring and set a fresh availability window. An expired provider must not be made to look available silently.
6. No full manual NVDA/VoiceOver/TalkBack review or physical iOS/Android open-keyboard test was executed. Automated accessibility checks do not establish WCAG compliance.
7. Queue/conversation updates use bounded five-second polling while visible and online. This is a lightweight demo implementation, not a guaranteed push-delivery service. Offline requests, messages and consent are never silently queued.

## Reproduce

Follow the root README for local setup and checks, `DEMO.md` for the role-by-role demonstration, `API.md` for request contracts, `PRIVACY.md` for retention/access boundaries and `OPERATIONS.md` for deployment/rollback. Use separate browser contexts for source reception, assigned practitioner, holder and recipient. Keep the private demo-access document separate from public competition materials.

## Floating accessibility control update

The existing larger-text control floats at the bottom-right of the public interface, with a 56-pixel touch target, safe-area offsets, a keyboard-visible focus indicator, pressed state and forced-colour support. Extra document space permits the final content/actions to scroll clear of the control. No sensitive preference is persisted. Production build, ESLint and all six local browser scenarios passed after the change; the keyboard scenario checks the toggle and its continued visibility after scrolling.
