# Changelog

## Phase 01 corrective revision — 2026-10-14 (Finding F01 Remediation)

- Resolved Expo CLI / `tar@7.5.22` default export incompatibility by adding `patches/tar@7.5.22.patch` via `pnpm.patchedDependencies`, exporting `default = exports` on CommonJS output while preserving tar security patches.
- Hardened `apps/mobile/package.json` `prebuild` script to assert `android/build.gradle` generation and fail closed on generation errors.
- Verified native Android project generation from clean state and compiled development APK (`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 128.4 MB) via `.\gradlew.bat assembleDebug`.
- Reconciled `README.md` to describe `apps/worker` as an executable lifecycle scaffold, clarifying that durable polling, leases, persistence, and retries belong to later phases.

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
