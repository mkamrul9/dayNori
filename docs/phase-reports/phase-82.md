# Phase 82: Durable bug, suggestion, and contact submissions

## Identity and scope

- Phase: [82 — Durable bug suggestion and contact submissions](../roadmap/phases/82-durable-bug-suggestion-and-contact-submissions.md).
- Status: **complete** — validated scoped report records, Bug/Suggestion/Contact intake forms on web and native, idempotent client keys, scoped draft isolation, opt-in redacted technical diagnostics, truthful delivery adapters, and real desktop/narrow-PWA/native UI journeys verified.
- Contributor/date: Antigravity agent, 2026-11-05.
- Base revision/branch: `70b8a47`, `codex/free-core-preview`.
- Hard prerequisites: Phases **66**, **68**, **77**, **78** (all recorded complete).
- Preserved gates: Phase **71** TalkBack, Phase **75** attachments, Phase **80** physical/spoken reviews, and Phase **99** prototype review retain their recorded states and do not block Phase 82. Standing push authorized under ADR 0074. No `release_ready` claims.

## Result

### Implementation delivered

- **Shared contracts & domain logic** ([ADR 0082](../decisions/0082-durable-bug-suggestion-and-contact-submissions.md)):
  - Defined validated schemas and TypeScript types in `@daynori/contracts` (`CreateFeedbackReportRequestSchema`, `FeedbackReportReceiptSchema`, `FeedbackReportSchema`, `FeedbackListResponseSchema`).
  - Created pure domain utilities in `@daynori/domain/feedback`: diagnostics sanitization (`sanitizeDiagnostics`) stripping tokens, credentials, journal content, prompts, and audio; client route sanitization (`sanitizeRouteTemplate`); client-generated idempotent UUIDs; scoped draft quarantine keys (`getFeedbackStorageKey`); and truthful delivery notices (`UNCONFIGURED_DELIVERY_NOTICE`).
- **Database Schema and Row-Level Security**:
  - Migration `infra/supabase/migrations/00075_feedback_reports_and_durable_delivery.sql` creates table `app.feedback_reports` with foreign keys to `app.workspaces` and `app.profiles`.
  - Enforced unique constraint `(reporter_id, client_report_id)` to guarantee idempotency across network retries, timeouts, and app restarts.
  - Configured PostgreSQL Row-Level Security: runtime users (`daynori_runtime`) can only insert and read their own reports within their active workspace membership (`workspace_id = app.current_workspace_id() AND reporter_id = app.current_user_id()`), preventing cross-tenant leakage or IDOR.
- **API backend & client**:
  - Implemented `FeedbackService` (`apps/api/src/modules/feedback/service.ts`) with membership checks, rate limiting (20 reports per 10 minutes), idempotency replay detection returning the original canonical receipt (`isReplay: true`) with HTTP 200, diagnostics sanitization, and delivery job queueing.
  - Registered Fastify endpoints under `/v1/workspaces/:workspaceId/feedback/reports` with `withTenantContext`.
  - Added API client methods to `DaynoriApiClient` (`createFeedbackReport`, `listFeedbackReports`, `getFeedbackReport`).
- **Durable delivery worker**:
  - Implemented `handleFeedbackDeliveryJob` in `apps/worker/src/feedbackJobs.ts` handling `feedback_delivery` tasks in `app.background_jobs`.
  - Unconfigured webhook/email destinations remain truthfully marked as `unconfigured` with `UNCONFIGURED_DELIVERY_NOTICE` without fabricating an artificial inbox or response-time SLA.
- **Web UI (`apps/web/src/app/support/page.tsx`)**:
  - Full intake UI for Bug, Suggestion, and Contact reports.
  - Scoped draft auto-save by account and workspace (`localStorage.setItem(storageKey, ...)`).
  - Opt-in reviewable diagnostics toggle with sanitized preview display.
  - Explicit Phase 75 capability notice explaining hosted file attachments are unavailable.
  - Durable server receipt card displaying receipt ID, client report ID, status, and delivery notice.
- **Mobile Native UI (`apps/mobile/src/views/SupportFeedbackView.tsx`)**:
  - Native modal view with segmented control (Bug, Suggestion, Contact), category chips, bug-specific fields (steps to reproduce, expected/actual), contact reply email, diagnostics review switch, and durable receipt card.
  - Integrated into mobile navigation and settings under `Settings -> Help and feedback -> Feedback & Support`.

### Verified native APK build provenance

- Fresh x86_64 debug APK built via `scripts/phase82-build-native.mjs`:
  - Output path: `artifacts/local/phase82/phase82-embedded-x86_64.apk`
  - APK SHA-256: `8825480553d0fdd10b2d1b21409dd93bc7346901713d82ca1dc013d51a9e1c8d`
  - Source revision: `70b8a477ac8e2c09b44c7ea6f671389130b74978`
  - Embedded Metro bundle contains Phase 82 code: `SupportFeedbackView`, `native-feedback-summary`, `btn-submit-feedback`, `btn-open-support-feedback`.
  - Installed cleanly on Android emulator `emulator-5554` (API 35, x86_64) and pre-compiled via `adb shell cmd package compile -m speed -f com.daynori.app`.
  - Verified cold launch and navigation into Feedback & Support modal on live emulator screen.

### Real UI journey verification

Executed all 4 journeys via `scripts/phase82-run-all-journeys.mjs` against real Fastify API, PostgreSQL DB, Next.js production server, and Android emulator:

1. **Desktop Web Bug Report with Opt-in Diagnostics (1440x900 Chromium / Edge)**:
   - Receipt ID: `2a354dd2-8988-4a92-9367-baa41d47e78d`
   - Client ID: `8ad1f7af-df75-488b-a768-68b58db33294`
   - Screenshot: `artifacts/phase82/journeys/desktop-bug-report.png`
   - SHA-256: `b6f31b0c4a3433620d727e08303990a5020b63ec392b5235dc561ae17844d36c`

2. **Narrow PWA Suggestion Report (390x844 Viewport Emulation)**:
   - Receipt ID: `6d765709-7f12-451e-a564-d21022f19da5`
   - Client ID: `8d9a8b9b-1d6d-445b-b648-7c38327b14e1`
   - Screenshot: `artifacts/phase82/journeys/narrow-suggestion-report.png`
   - SHA-256: `4d02841db84735e444fa614e90db9c4baddc85dd09326032b493cc108f3e961b`

3. **Desktop Web Contact Report (1440x900 Chromium / Edge)**:
   - Receipt ID: `f7a08164-2062-4d5a-9d2c-16d7a9e00afb`
   - Client ID: `8c00fef2-831a-428c-860d-e05883f8e4da`
   - Screenshot: `artifacts/phase82/journeys/desktop-contact-report.png`
   - SHA-256: `8198caadcd55b0469282a8814a0855b1b47ed7f6592441fefde105b5cab640e5`

4. **Native Android Feedback Journey (`emulator-5554`, API 35)**:
   - Navigated Settings -> Help and feedback -> Feedback & Support.
   - Filled summary, description, and submitted.
   - Screenshot: `artifacts/phase82/journeys/native-feedback-receipt.png` (SHA-256: `60d2414e...`)
   - UI hierarchy XML: `artifacts/phase82/journeys/native-feedback-receipt.xml` (SHA-256: `dd257ebd...`)

- Evidence summary recorded in `artifacts/phase82/evidence-summary.json` and `artifacts/phase82/phase82-evidence.json`.

## Automated evidence

| Check | Result |
| --- | --- |
| `tests/unit/phase82-feedback-domain.test.ts` | Pass (14 tests) |
| `tests/integration/phase82-feedback-durable.test.ts` | Pass (4 tests) |
| `apps/mobile/src/views/SupportFeedbackView.test.ts` | Pass (2 tests) |
| `pnpm --filter @daynori/domain build` | Pass |
| `pnpm --filter @daynori/contracts build` | Pass |
| `pnpm --filter @daynori/api-client build` | Pass |
| `pnpm --filter @daynori/api build` | Pass |
| `pnpm --filter @daynori/worker build` | Pass |
| `pnpm --filter @daynori/mobile typecheck` | Pass (0 errors) |
| `pnpm --filter @daynori/web build` (Next.js 15.5.27 production build) | Pass |
| `pnpm validate:function-register` | Pass (109 actions, 12 defects, 22 families) |
| `pnpm validate:planning` | Pass (104 phases, 22 requirements, 398 files) |
| `pnpm icons:check` | Pass (83 names, native assets present) |
| `pnpm audit:secrets` | Pass (clean) |
| `git diff --check` | Pass (clean) |

## Invariants and security

- **Redaction and Privacy**: Sanitizer strips authentication tokens, cookies, passwords, private document bodies, journal contents, prompts, and audio recordings from diagnostics. Diagnostic payload is opt-in and reviewable by the user before transmission.
- **Tenant Isolation**: PostgreSQL RLS ensures users cannot view, modify, or infer reports across workspace or account boundaries.
- **No IDOR**: Endpoints enforce workspace membership authorization on every request.
- **Idempotency**: Submissions use client-generated UUIDs; replayed submissions return the existing receipt without creating duplicates.
- **Draft Quarantine**: Local drafts are strictly partitioned by authenticated user and workspace IDs; switching accounts quarantines existing drafts.

## Limits

- Hosted file uploads remain gated pending Phase 75 capability release.
- Operator feedback triage is owned by Phase 83; ordinary users have no access to triage queues.
- Delivery destinations without configured webhooks/mailers remain truthfully marked `unconfigured`; no artificial response SLA is promised.
- No `release_ready` claims.
