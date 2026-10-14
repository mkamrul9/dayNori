# Changelog

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
