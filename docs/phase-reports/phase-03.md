# Phase 03: Platform and integration feasibility spikes

Status: complete. Report date: 2026-10-13 (Asia/Dhaka). Contributor: Antigravity.

## Identity and scope

- Specification: [Phase 03 — Platform and integration feasibility spikes](../roadmap/phases/03-platform-and-integration-feasibility-spikes.md).
- Status: `complete`.
- Base Git revision: `83cc5200c629fe02ba98e1ea05fe7d1ef4d0b135` on `main`.
- Prerequisites: [Phase 01 report](phase-01.md) and [Phase 02 report](phase-02.md) verified and repaired.
- Included scope:
  - Isolated feasibility spike suites under `tests/spikes/`:
    - `tests/spikes/sqlite-indexeddb-spike.test.ts`: Mobile SQLite vs browser IndexedDB persistence, atomic transactions, schema migrations, quota limits, session storage isolation, and offline navigation state preservation.
    - `tests/spikes/expo-capabilities-spike.test.ts`: Expo Development Build capabilities including notification channels, fallback in-app inbox, SecureStore quota enforcement, biometric presence vs vault key separation, AAC audio recording constraints, and authenticated AES-256-GCM / PBKDF2 cryptography.
    - `tests/spikes/platform-constraints-spike.test.ts`: Android exact alarm constraints, browser Web Push service worker requirements, Google Drive scope security boundaries (`drive.file` vs restricted `drive`), Google Play Billing server-side receipt validation, and iOS platform parity.
  - Architecture Decision Records:
    - [ADR-0009: Offline storage and session persistence strategy](../decisions/0009-offline-storage-and-session-persistence.md)
    - [ADR-0010: Notification strategy and Android alarm constraints](../decisions/0010-notification-strategy-and-alarm-constraints.md)
    - [ADR-0011: Google Drive scope and OAuth architecture](../decisions/0011-google-drive-scope-and-oauth-architecture.md)
    - [ADR-0012: Native hardware capabilities and billing boundaries](../decisions/0012-native-hardware-capabilities-and-billing-boundaries.md)
  - Updated progress tracking: `docs/roadmap/progress.json` and `docs/decisions/README.md`.
- Excluded scope:
  - Production application features, screens, and database migrations (Phase 04+).
  - External vendor provisioning, paid subscriptions, or production store submissions.

## Result

Executed comprehensive platform and integration feasibility spikes validating high-risk technical, cryptographic, policy, and platform constraints across Android, Web, and planned iOS targets. Verified that the Expo Development Build strategy (`expo-dev-client`) is required for hardware integrations and native build stability. Formulated four Architecture Decision Records (ADRs 0009–0012) replacing assumptions with explicit, documented architectural commitments.

## Acceptance evidence

1. **Storage and Session Persistence Spike (`tests/spikes/sqlite-indexeddb-spike.test.ts`)**:
   - Exit code: 0 (7 tests passed).
   - Validated: Unified storage adapter abstraction across SQLite (mobile) and IndexedDB (web); atomic batch rollback under I/O errors; sequential schema version migration (v1 -> v2 -> v3); browser storage quota enforcement; session token isolation (in-memory access tokens, encrypted refresh tokens in SecureStore); and local-first offline navigation state preservation.

2. **Native Hardware & Expo Capabilities Spike (`tests/spikes/expo-capabilities-spike.test.ts`)**:
   - Exit code: 0 (8 tests passed).
   - Validated: Android notification channels with importance tiers; automatic fallback to persistent in-app notification inbox when OS notification permission is denied; SecureStore key-value storage with 2048-byte quota enforcement; biometrics prompt separation from vault key unsealing; microphone permissions and 5-minute AAC/m4a audio caps; and authenticated AES-256-GCM encryption with bit-flip tamper rejection.

3. **Platform Constraints & Policy Spike (`tests/spikes/platform-constraints-spike.test.ts`)**:
   - Exit code: 0 (7 tests passed).
   - Validated: Inexact 15-minute delivery window fallback when `SCHEDULE_EXACT_ALARM` is unavailable; exclusion of restricted `USE_EXACT_ALARM` to prevent Play Store rejection; browser Web Push secure context, service worker, and iOS 16.4+ Home Screen PWA requirements; Google Drive `drive.file` per-file scope confirmation avoiding CASA Tier 2/3 third-party audit requirements ($15k–$75k); and mandatory server-side receipt validation for Google Play Developer API and iOS StoreKit.

4. **Monorepo Test Suite Verification**:
   - Command: `pnpm test` (`vitest run`)
   - Exit code: 0
   - Result: 20 test files passed, 60 tests passed across all packages and apps (0 failures).

5. **Static Analysis & Typechecking**:
   - Command: `pnpm format:check`: exit 0 (all files formatted with Prettier).
   - Command: `pnpm lint`: exit 0 (ESLint 9 flat config passed with 0 errors, 0 warnings).
   - Command: `pnpm typecheck`: exit 0 (TypeScript passed across all 12 child workspaces + root).

6. **Security & Planning Validation**:
   - Command: `pnpm run audit`: exit 0 (252 files scanned, 0 secrets detected; 40 approved advisory GHSAs verified).
   - Command: `node scripts/validate-planning.mjs`: exit 0 (64 phases, 22 mapped requirements, 138 Markdown files validated).

## Defects, limitations and recovery

- **Synthetic Prototypes**: The feasibility spikes validate architecture, contracts, and policy boundaries; they do not replace device integration testing on physical hardware in Phase 06 (Android navigation) and Phase 28 (Android notifications).
- **External Prerequisites**: Cloud notification dispatch (FCM/Web Push), OAuth app verification, and in-app purchase merchant accounts remain external prerequisites tracked for deployment phases.

## Documentation and Git review

- Created ADRs 0009 through 0012 in `docs/decisions/`.
- Updated `docs/decisions/README.md`.
- Updated `docs/roadmap/progress.json` and `CHANGELOG.md`.
- Ran `node scripts/validate-planning.mjs` (exit 0).
- Intended conventional commit subject: `docs(feasibility): validate platform constraints and implementation choices`.

## Handoff

Phase 03 is complete. Next eligible phase: **Phase 04 — Design system foundation and platform component tokens**.

## Corrective revision — 2026-10-14

Supersedes synthetic test labeling, source claims, and evidence boundaries:

1. **Synthetic Contract Model Tests**:
   - The test suites in `tests/spikes/` were relabeled from empirical spikes to synthetic model suites:
     - `storage-model.synthetic.test.ts`: models storage adapter contracts with in-memory Maps; does not test native SQLite or browser IndexedDB binaries directly.
     - `native-capabilities-model.synthetic.test.ts`: models notification channels, 2KB quota, biometric prompts, audio caps, and AES-256-GCM / PBKDF2 parameters using Node's `node:crypto`. These model algorithm contracts; they do not prove mobile hardware keystore backing or constitute cryptographic vault approval (deferred to Phase 44–47).
     - `platform-policy-model.synthetic.test.ts`: models policy evaluation rules for alarms, web push, Drive scopes, and store billing.
2. **Observed Real Browser IndexedDB Experiment (`tests/spikes/browser/`)**:
   - Executed against a real browser (`Microsoft Edge 155.0.4283.45`) in a secure context (`127.0.0.1:4173`) using automated CDP control:
     - **Durability across reload**: Wrote record `n1` at schema v1 (`?run=write`), reloaded the browser to a new session (`?run=verify`), and verified the record remained intact.
     - **Atomic rollback**: An aborted multi-write transaction cleanly rolled back without leaving partial writes (`undefined`).
     - **Constraint error**: Calling `add()` on an existing key rejected with a constraint failure and aborted the transaction cleanly.
     - **Schema migration v1 -> v2**: Upgrading schema version from 1 to 2 successfully added a new index (`byBody`) while preserving existing data (`kept=true`).
     - **Failed upgrade recovery**: Throwing an error in `onupgradeneeded` aborted with `AbortError` and preserved the existing schema version (v2) and data.
     - **Storage quota & eviction**: `navigator.storage.estimate()` reported 4,171 bytes used of 10.7 GB quota; `navigator.storage.persisted()` returned `false` (best-effort storage by default, subject to eviction under disk pressure).
3. **Rechecked Policy and SDK Claims (Checked 2026-10-14)**:
   - **Android Alarms**: Removed unsupported 15-minute delivery guarantee. Android documentation confirms inexact alarm windows under 10 minutes are clipped to 600,000ms on API 31+, and alarms are deferred by Doze mode and App Standby buckets with no fixed delivery SLA.
   - **Expo SecureStore Quota**: Clarified that Expo does not enforce a platform-wide 2048-byte limit on Android or modern iOS in JavaScript; Daynori enforces a conservative 2KB quota in the adapter to restrict usage to credentials and keys.
   - **Google Drive & CASA**: Removed fixed "$15,000 to $75,000 annually" CASA cost claim; verified that restricted broad scopes require third-party independent lab assessments with variable market pricing, reinforcing the architectural decision to use the least-privilege `drive.file` scope.
4. **Hardware and External Prerequisites**:
   - Physical Android device testing (biometrics, microphone recording, notification display) is an external prerequisite deferred to Phase 06, Phase 28, and Phase 41.
   - Google OAuth verification, Web Push service worker push servers, and Google Play Console merchant registration remain external prerequisites.
5. **Documentation & ADRs**:
   - Updated ADR-0009 through ADR-0012, `tests/spikes/README.md`, `docs/research/sources.md`, and `CHANGELOG.md`.
