# Upgrade verification

Environment: Node24, Next16.4 production build, PostgreSQL17 and local Supabase Auth; synthetic adult fixtures only. Browser: system Chromium. Hosted verification uses the new Neon/Better Auth environment, separately recorded.

Baseline before changes: 49 unit/API tests and 18 production browser tests passed on 23 October 2026. Historical suites are retained as `.txt` fixtures under `tests/baseline`; tests for superseded Shona and reception-chat behaviour are replaced, rather than incorrectly claimed as current passing coverage.

Current checks are recorded in the final release evidence. Unit/API tests cover five-language key coverage and fallback, deterministic matching, idempotency, separate reception/private credentials, assigned-only chat, organisation isolation, exact consent hashes, edit invalidation, recipient-only snapshots, cancellation, acknowledgement, provider expiry/check-in and scrubbed metadata. Unchanged domain/TLS/local Supabase MFA tests remain active.

23 October release verification: production build, TypeScript and ESLint passed; 38 unit/API tests passed; six local production browser scenarios passed; six hosted browser scenarios passed against https://healthkey-connect.vercel.app. A prior exact-text assertion was corrected to include the rendered operational-outcome label before the clean runs. See [release evidence and limitations](RELEASE.md). Hourly scheduling is blocked by project capability and no scheduled background execution has been observed.

Browser scenarios cover the synthetic two-provider journey, language persistence/Shona migration, six widths (320/375/390/768/1024/1440), landscape (768x375), mobile administration, 200% text enlargement, selected axe checks, offline no-auto-send and shared-kiosk timeout. Screenshots in this folder document rendered reviews. Run API/database tests and browser tests sequentially; expiry fixtures deliberately change local state.

Failures are corrected and rerun; interrupted and failing runs are never counted as passes. Full manual screen-reader testing (NVDA, VoiceOver, TalkBack), open-keyboard testing on physical iOS/Android, native-language/practitioner review, performance under field connectivity, backup/PITR and safeguarding acceptance remain pending. Automated axe results and screenshots do not establish WCAG compliance.


26 October submission-day verification: 39 unit/API tests, seven local production browser scenarios and seven hosted public-judge browser scenarios passed. The new regression proves an expired review cannot falsely show acceptance or send until explicit synthetic preparation succeeds. Preparation preserves the stale example and existing requests. See the submission-day record in RELEASE.md for deployment identity and scope.
