# Changelog

## Phase 07 — PostgreSQL and tenant isolation foundation — 2026-10-14

- Established PostgreSQL schema migrations (`infra/supabase/migrations/00001_initial_schema.sql` and `00002_forward_fix_example.sql`) defining tenant tables: `profiles`, `workspaces`, `workspace_memberships`, `items`, `audit_events`, and `storage_objects`.
- Applied `FORCE ROW LEVEL SECURITY` across all tenant tables and created dedicated non-owner runtime role (`daynori_runtime` with `NOBYPASSRLS`).
- Implemented transaction-local tenant context isolation (`set_config('app.current_user_id', ..., true)` and `set_config('app.current_workspace_id', ..., true)`) inside `withTenantContext`, ensuring automatic context reset on commit/rollback and zero identity leakage across connection pool reuse.
- Enforced composite primary key `(workspace_id, id)` and folder relation `FOREIGN KEY (workspace_id, folder_id) REFERENCES app.items (workspace_id, id)` on `app.items`, rendering cross-tenant hierarchy references impossible at the relational constraint layer.
- Added non-recursive authorization helper `app.user_has_workspace_role()` with pinned `search_path = app, pg_temp`.
- Implemented database client, connection pool management, and repository modules in `apps/api/src/db/` (`workspaceRepository`, `membershipRepository`, `itemRepository`, `auditRepository`, `storageRepository`).
- Built migration runner in `infra/supabase/migrator.ts` with SHA-256 checksum verification and idempotent re-runs.
- Created security integration test suite in `tests/security/tenant-isolation.test.ts` (16 passing tests against real local PostgreSQL 17 instance `daynori_test`).
- Documented architecture and security decisions in `docs/decisions/0013-postgresql-tenant-isolation-and-rls.md`.

## Phase 05 and Phase 06 navigation corrections — 2026-10-14

- **Phase 05 (Web Navigation Repairs):**
  - Added user-accessible Character Key Shortcut toggles (`shortcutsEnabled`) in `ShellContext.tsx` and Settings Section 5 (`/settings`) conforming to WCAG 2.1.4 (Character Key Shortcuts), allowing users to disable single-character shortcuts while preserving `Escape`.
  - Added automated browser CDP tests in `scripts/test-web-e2e.mjs` verifying single-character key suppression and re-enabling across 32 headless Edge checks.
  - Corrected handoff documentation in `docs/phase-reports/phase-05.md` clarifying product persistence belongs to Phase 10+ and Phase 07 delivers PostgreSQL tenant isolation foundation.
- **Phase 06 (Android Navigation Repairs):**
  - Rewrote `scripts/test-android-e2e.mjs` to separate preflight from on-device E2E; runner reports missing hardware/emulator as `BLOCKED_MISSING_PREREQUISITE` and exits non-zero (exit code 1) instead of substituting unit tests.
  - Created lightweight hook-supporting mounted component evaluator in `apps/mobile/src/test-render.ts` to execute interactive mounted component tests across `TodayView`, `PlanView`, `LibraryView`, `JournalView`, `SettingsView`, and `CreateSheet` without adding conflicting external dependencies.
  - Hardened deep link authentication in `apps/mobile/App.tsx`: eliminated synthetic login calls on external `auth` deep links; provider authentication remains deferred to Phase 09.
  - Enforced strict scheme whitelist (`daynori://`, `https://app.daynori.com`), bounded identifiers, strict positive integer timestamps, and error token redaction in `packages/contracts/src/routing.ts`.
  - Configured actual Expo scheme `daynori` and Android intent filters for custom scheme and app links in `apps/mobile/app.json` and `AndroidManifest.xml`.
  - Restricted synthetic login controls in `SettingsView.tsx` to an explicit development review mode (`devReviewMode`), defaulting runtime strictly to unauthenticated.
  - Resolved Windows MAX_PATH (>260 chars) Ninja build failure in `apps/mobile/android/build.gradle` for `expo-modules-core` and verified fresh debug APK compilation (128.4 MB).

- Implemented native bottom navigation bar in `@daynori/ui-mobile/MobileNavigationBar` with four labeled parent destinations: Today, Plan, Library, and Journal, maintaining >= 48dp touch targets.
- Built Plan segmented sub-views for Tasks, Routines, and Calendar (Calendar projection under Plan).
- Built Library view with canonical folder breadcrumb (`Workspace > Software`), module filter chips (All Items, Notes, Knowledge, Files), and folder action buttons.
- Integrated protected destination gating for Journal via `MobileAuthAdapter` (defaults strictly unauthenticated; unauthenticated access renders an authentication requirement screen and queues pending destination).
- Added consistent top `MobileHeader` with contextual titles, Search action, Create action, and Settings/Help action.
- Built accessible Search modal sheet and Create quick-capture sheet with input draft preservation across shell navigation.
- Added Settings destination with Light/Dark theme toggle, 100%–200% font scaling, OS reduced motion status indicator, Bangla (বাংলা) script readability preview with 1.6 line-height, and link to preserved Phase 04 Component Gallery.
- Implemented Android hardware Back button handling (`BackHandler`): dismisses open sheets, returns from child views to parent tab, returns to Today from other tabs, and exits cleanly from Today.
- Implemented `AppState` lifecycle handling to preserve navigation state and uncommitted drafts across background and resume transitions.
- Defined typed route contracts in `@daynori/contracts` (`NotificationPayloadSchema`, `FilePayloadSchema`, `AuthPayloadSchema`) with strict safe identifier validation rejecting path traversal and SQL injections.
- Implemented cold-start and warm-start deep-link handling with 5-second idempotent deduplication.
- Replaced `test:e2e:android` placeholder in `package.json` with real runner in `scripts/test-android-e2e.mjs`.
- Compiled fresh Android development APK (`app-debug.apk`, 128.4 MB) via Gradle `assembleDebug`.
- Retained Phase 06 status as `blocked` in `docs/roadmap/progress.json` pending physical Android TalkBack hardware verification.

## Phase 04 corrective revision — 2026-10-14 (Findings F03–F10 Remediation)

- Added semantic action danger tokens (`danger`, `dangerHover`, `dangerLabel`) in `packages/design-tokens` for light theme (`#B3261E`/`#FFFFFF`, 6.54:1) and dark theme (`#F2B8B5`/`#381615`, 9.51:1); wired `Button` and `MobileButton` to consume them, resolving F03.
- Updated `ListRow` and `MobileListRow` selected metadata color to `palette.text.secondary`, achieving 5.37:1 contrast on light subtle surface and 7.24:1 on dark subtle surface, resolving F04.
- Corrected web `ListRow` ARIA semantics from invalid `aria-selected` to `role="button"` with `aria-pressed={selected}`; verified keyboard Enter/Space activation and toggle state exposure, resolving F05.
- Hardened `TextField` description references in `packages/ui-web` to reference only rendered elements (`errorMessage ? errorId : helperText ? helperId : null`) while preserving caller-provided `aria-describedby` IDs; added unit tests for error recovery and description merging, resolving F06.
- Fixed narrow-screen text clipping and enabled font scaling up to 200%: enabled text wrapping (`overflowWrap: 'anywhere'`) on list rows, wrapped the contrast table in an accessible horizontally scrollable container (`role="region"`), and added `--daynori-text-scale` CSS variable for real font scaling; verified reflow at 320px viewport with zero document horizontal overflow, resolving F07.
- Enlarged `MobileModalSheet` close button touch target to 48dp minimum (`touchTargets.mobileMin: 48`); added `ScrollView` and `KeyboardAvoidingView` to support safe-area, enlarged content, and keyboard avoidance, resolving F08.
- Added dynamic OS reduced motion support to `MobileModalSheet` using React Native's `AccessibilityInfo.isReduceMotionEnabled()` and `reduceMotionChanged` listener, disabling slide animations when enabled, resolving F09.
- Hardened automated browser verification runner `tests/spikes/browser/run-primitives.mjs` using Chrome DevTools Protocol against headless Microsoft Edge, testing the actual mounted Next.js React application at `http://127.0.0.1:3000/review` across 11 assertions (contrast, aria-pressed, keyboard activation, description binding, dialog focus trap, 150% font scale, 320px reflow); clearly labeled `tests/spikes/browser/primitives-real.html` as a synthetic prototype harness, resolving F10.
- Reconciled Phase 04 verification status: retained `in_progress` in `docs/phase-reports/phase-04.md` and `docs/roadmap/progress.json` pending physical Android TalkBack hardware verification.

## Phase 01 corrective revision — 2026-10-14 (Finding F01 Remediation)

- Resolved Expo CLI / `tar@7.5.22` default export incompatibility by adding `patches/tar@7.5.22.patch` via `pnpm.patchedDependencies`, exporting `default = exports` on CommonJS output while preserving tar security patches.
- Hardened `apps/mobile/package.json` `prebuild` script to assert `android/build.gradle` generation and fail closed on generation errors.
- Verified native Android project generation from clean state and compiled development APK (`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 128.4 MB) via `.\gradlew.bat assembleDebug`.

## Phase 02 corrective revision — 2026-10-14 (Finding F02 Remediation)

- Investigated upstream releases on npm for `node-forge` (`1.4.0`) and `braces` (`3.0.3`); confirmed no newer/patched releases exist (`patchedVersions: "<0.0.0"`).
- Maintained strict fail-closed enforcement of `scripts/audit-dependencies.mjs` without inventing human approvals or self-authorizing exceptions.
- Documented exact dependency tree, blocker assessment, and human owner approval requirements in `docs/security/pending-exception-proposals.md` and `docs/phase-reports/phase-02.md`.

## Phase 03 corrective revision — 2026-10-14 (Finding F10 Part 1 Remediation)

- Corrected IndexedDB error capture in `tests/spikes/browser/indexeddb-real.html` to record `ConstraintError` on duplicate key addition.
- Hardened `tests/spikes/browser/run-edge.mjs` with self-contained server lifecycle, cross-browser discovery, and strict assertions on `window.__results` that fail closed on missing outcomes, timeouts, or experiment errors.
- Verified all three stages (`?run=write`, `?run=verify`, `?run=all`) against headless Microsoft Edge 155 with exit code 0.

## Phase 05 — 2026-10-14 (Provisional web shell implementation)

- Built the responsive web navigation shell in `apps/web` and `packages/ui-web` matching the information architecture in `docs/design/information-architecture.md`.
- Implemented desktop sidebar navigation (&ge; 1024px), tablet transitions (768px–1023px), and compact mobile bottom navigation (< 768px down to 320px width) with zero horizontal overflow/clipping.
- Built parent routes: Today (`/today` and `/`), Plan (`/plan`), Calendar under Plan (`/plan/calendar`), Library (`/library`), and Journal (`/journal`).
- Provided consistently reachable global controls: Search modal with shortcut `/`, Create item modal with shortcut `c`, Theme toggle (Light/Dark), Help & Shortcuts modal with shortcut `?`, and Workspace Profile modal.
- Added Settings page (`/settings`) supporting theme mode switching, text scaling (100% to 200%), Right-to-Left (RTL) reading direction, and Bengali (বাংলা) font rendering and readability preview with 1.6 line-height.
- Added Help page (`/help`) with accessible keyboard shortcuts reference and landmark structure guide.
- Added accessible 404 page in `apps/web/src/app/not-found.tsx`.
- Preserved Phase 04 component review gallery at `/review`.
- Implemented accessible primitives in `packages/ui-web`: `EmptyState`, `SkipLink`, and `RouteAnnouncer` (with `aria-live="polite"` route change announcements).
- Replaced the root `test:e2e:web` echo placeholder in `package.json` with a real automated browser test script (`scripts/test-web-e2e.mjs`) executing 30 interactive checks in Microsoft Edge via Chrome DevTools Protocol (CDP).
- Tracked Phase 05 status as `blocked` in `docs/roadmap/progress.json` and recorded the provisional implementation in `docs/phase-reports/phase-05.md` pending prerequisite Phase 04 physical Android TalkBack hardware verification.

## Phase 04 — 2026-10-14

- Encoded semantic design tokens in `packages/design-tokens` for light and dark themes (warm paper, dark ink, deep teal, soft amber), spacing, radii, touch targets, focus treatments, motion, and specialized Bangla line-height (`1.6`).
- Implemented WCAG 2.2 relative luminance and contrast ratio calculation utilities and verified all core color pairs meet Level AA requirements (including ink on paper 13.44:1, dark primary on dark surface 14.05:1, and essential UI borders >= 3.0:1).
- Implemented accessible browser UI primitives in `packages/ui-web`: `Button`, `TextField`, `Dialog`, `Feedback`, `ListRow`, `Card` with focus trapping, Escape key closing, and touch targets >= 44px.
- Implemented native mobile UI primitives in `packages/ui-mobile`: `MobileButton`, `MobileTextField`, `MobileModalSheet`, `MobileFeedback`, `MobileListRow`, `MobileCard`, and `theme` with 48dp minimum touch targets.
- Created interactive component review surface in `apps/web/src/app/page.tsx` supporting light/dark theme switching, RTL layout, font scaling, error toggling, dialog focus management, and Bangla script readability.
- Created mobile component gallery in `apps/mobile/App.tsx` displaying all primitives and states.
- Recorded physical Android device TalkBack testing as a remaining hardware gate in `docs/phase-reports/phase-04.md`.

## Phase 03 corrective revision, 2026-10-14

- Relabeled `tests/spikes/` suites as synthetic contract/model tests (`storage-model.synthetic.test.ts`, `native-capabilities-model.synthetic.test.ts`, `platform-policy-model.synthetic.test.ts`) that test contract shapes in-memory rather than actual native hardware or browser storage.
- Added real browser IndexedDB experiment (`tests/spikes/browser/`) and executed via automated Chrome DevTools Protocol against Microsoft Edge 155; observed and recorded transaction rollback on abort, duplicate key constraint failure, schema migration v1->v2 with index creation and data retention, upgrade error rollback, and storage estimate/eviction flags.
- Rechecked primary vendor sources (2026-10-14): removed unsupported 15-minute alarm delivery guarantee in favor of Android 12+ >=10 minute clipping and Doze best-effort delivery; clarified SecureStore adapter 2KB quota vs lack of universal JS limit in Expo; removed fixed CASA dollar figures for Google Drive restricted scopes; and clarified that Node crypto tests do not constitute cryptographic vault approval.
- Updated ADRs 0009 through 0012, `tests/spikes/README.md`, `docs/research/sources.md`, and `docs/phase-reports/phase-03.md`.

## Phase 01-02 corrective revision, 2026-10-14

- Moved the runtime baseline to Node 24.21.0 (Active LTS) and upgraded Next.js to 15.5.x and Vitest to 4.1.x; added overrides for `tar`, `@xmldom/xmldom`, `image-size` and `postcss`.
- Rewrote the dependency audit gate: it now rejects process failures, signals and malformed reports, and matches exceptions by advisory, installed version and dependency path. Removed 40 unapproved exceptions. Two advisories without a patched release remain, so `pnpm audit:deps` fails until the owner approves exceptions (`docs/security/pending-exception-proposals.md`).
- Tests now run the real audit implementation and CLI.

## Phase 03 — 2026-10-13

- Executed platform and integration feasibility spikes under `tests/spikes/`:
  - Validated SQLite vs IndexedDB storage adapters, atomic rollbacks, schema migrations, quota management, and auth session persistence (`sqlite-indexeddb-spike.test.ts`).
  - Evaluated native hardware capabilities: notification channel importance, in-app notification center fallback, SecureStore 2KB size constraints, biometric presence vs vault key separation, 5-minute AAC audio recording limits, and authenticated AES-256-GCM cryptography (`expo-capabilities-spike.test.ts`).
  - Validated platform constraints: Android exact alarm policies (rejecting restricted `USE_EXACT_ALARM`), Web Push requirements, Google Drive least-privilege `drive.file` scope, server-side Google Play Developer API and StoreKit receipt verification, and iOS platform parity (`platform-constraints-spike.test.ts`).
- Created Architecture Decision Records ADR-0009 through ADR-0012 in `docs/decisions/`.
- Updated `docs/roadmap/progress.json` setting Phase 03 to complete and identifying Phase 04 as next eligible phase.

## Phase 02 — 2026-10-13

- Added GitHub Actions continuous integration workflows (`.github/workflows/ci.yml`, `.github/workflows/security.yml`) with minimal token permissions (`contents: read`).
- Created repository secret scanner (`scripts/scan-secrets.mjs`) with output redaction and dependency vulnerability audit wrapper (`scripts/audit-dependencies.mjs`) with granular `.security-exceptions.json` registry enforcing specific advisory GHSAs, expiration, and accountability.
- Added comprehensive synthetic test suite (`tests/security/scanner-synthetic.test.ts`) covering secret detection/redaction, unapproved advisory rejection, unrelated advisories in excepted packages, expired exceptions, and registry service errors.
- Established pull request template (`.github/pull_request_template.md`) and issue templates (`bug_report.md`, `phase_proposal.md`, `config.yml`).
- Documented branch protection rules and protected deployment environment policies in `docs/engineering/contributor-automation.md`.
- Added root `audit`, `audit:deps`, and `audit:secrets` scripts.

## Phase 01 — 2026-10-13

- Configured pnpm monorepo workspace manifests, pinned dependencies, Node LTS configuration, and strict TypeScript rules.
- Replaced reserved directory placeholders with minimal runnable workspaces: `apps/api`, `apps/worker`, `apps/web`, `apps/mobile`, and shared packages (`packages/*`).
- Added Fastify health and smoke endpoints, Next.js web application shell, Expo mobile entrypoint with Metro monorepo resolver, and typed API client.
- Implemented root verification scripts: `build`, `typecheck`, `test`, `test:contract`, `test:integration`, `test:security`, `test:performance`, `lint`, and `format:check`.
- Established verified development startup (`pnpm dev:web`, `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:mobile`), pinned Node LTS `20.18.3`, and compiled native Expo Android development build APK (`app-debug.apk`) using `expo-dev-client`.

## Phase 00 — 2026-10-13

- Defined the personal organizer product, feature boundaries, provisional brand, and design direction.
- Specified web/mobile architecture, domain model, offline synchronization, integrations, and privacy boundaries.
- Established a granular roadmap, individual phase plans, quality gates, reports, contributor handoff, and repository layout.
- Added executable planning validation. Application implementation starts in Phase 01.
