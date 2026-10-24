# Phase 36: Account deletion backup and recovery lifecycle

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [36 — Account deletion backup and recovery lifecycle](../roadmap/phases/36-account-deletion-backup-and-recovery-lifecycle.md)
- **Status:** `blocked` (Software implementation, reauthentication enforcement, session token revocation, device subscription invalidation, collaborative shared content reassignment, dual-layer storage purge, worker blob purge jobs, suppression ledger, disaster recovery restore drill, Google Play policy compliance web resource, Web AccountDeletionDialog, Mobile MobileAccountDeletionSheet, and 20 integration tests verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` due to prerequisite physical Android TalkBack / KeyStore hardware gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-18.
- **Base Git revision and branch:** `122e0a7: fix(portability): repair reauthentication, export durability, and import safety` on `main`.
- **Prerequisites:**
  - [Phase 35 — Portable export and controlled import](phase-35.md): Reauthentication infrastructure, multi-format export, and storage provider contracts.
  - [Phase 24 — Private binary upload lifecycle and quarantine](phase-24.md): Storage provider interfaces, private assets bucket isolation, and worker job processing.
  - [Phase 10 — Personal workspace and user preferences](phase-10.md): Workspaces, memberships, and user profile management.
- **Included scope:**
  - **Shared Data Contracts (`packages/contracts`)**:
    - `packages/contracts/src/api/deletion.ts`: Defined Zod schemas and TypeScript types: `RequestAccountDeletionBodySchema`, `RequestAccountDeletionResponseSchema`, `ConfirmAccountDeletionBodySchema`, `ConfirmAccountDeletionResponseSchema`, `CancelAccountDeletionBodySchema`, `CancelAccountDeletionResponseSchema`, `AccountDeletionStatusResponseSchema`, `RequestWorkspaceDeletionBodySchema`, `RequestWorkspaceDeletionResponseSchema`, `PublicDeletionRequestSubmissionSchema`, and `PublicDeletionRequestResponseSchema`.
    - `packages/contracts/src/api/portability.ts`: Extended `ReauthenticatePurposeSchema` with `account_deletion` and `workspace_deletion`.
  - **Deletion Service (`apps/api/src/modules/lifecycle/deletionService.ts`)**:
    - Implemented `DeletionService` separating full account deletion from single workspace deletion:
      - `requestAccountDeletion`: Mandates fresh reauthentication (password or bound signed ticket), generates cryptographic confirmation token, establishes 24-hour cancellation deadline, and provides explicit retention disclosure.
      - `confirmAccountDeletion`: Validates confirmation token hash, transitions state to `processing`, revokes session tokens in `app.revoked_tokens`, purges device and Web Push subscriptions, reassigns shared workspace content to respective workspace owners (`created_by = w.owner_id`), deletes owned workspaces in transactional cascade, purges file items and export archives from private object storage, deletes user profile, and records cryptographic 90-day tombstone in `app.deletion_suppression_ledger`.
      - `cancelAccountDeletion`: Allows cancellation of pending deletions prior to confirmation.
      - `getAccountDeletionStatus`: Returns current deletion lifecycle state, deadline, and error details.
      - `deleteSingleWorkspace`: Authorized workspace owner deletion; purges all items, attachments, routine occurrences, and sync records within the specified workspace while leaving the caller's profile and other workspaces intact.
      - `submitPublicDeletionRequest`: Public web endpoint for users without active app installations; enumeration-safe with generic acknowledgment.
  - **Auth Middleware Token & Account Suppression Checks (`apps/api/src/auth/middleware.ts`)**:
    - Updated `createAuthMiddleware` to check `app.revoked_tokens` for revoked token hashes and `app.deletion_suppression_ledger` for suppressed deleted accounts, rejecting unauthorized calls with HTTP 401 Unauthorized (`TOKEN_REVOKED` or `ACCOUNT_DELETED`).
  - **Fastify HTTP Routes (`apps/api/src/routes/v1/deletion.ts`, `apps/api/src/server.ts`)**:
    - Registered authenticated deletion routes: `POST /v1/auth/account-deletion/request`, `POST /v1/auth/account-deletion/confirm`, `POST /v1/auth/account-deletion/cancel`, `GET /v1/auth/account-deletion/status`, and `POST /v1/workspaces/:workspaceId/deletion`.
    - Registered unauthenticated public deletion route: `POST /v1/public/account-deletion-request`.
  - **Background Worker Storage Purge Job (`apps/worker/src/worker.ts`)**:
    - Registered `blob_purge` task handler in `DaynoriWorker` to asynchronously purge residual storage objects from private buckets.
  - **Database Migrations (`infra/supabase/migrations`)**:
    - `00032_account_deletion_lifecycle_fks.sql`: Relaxed foreign keys to allow profile deletion while preserving audit logs and suppression ledgers.
    - `00033_revoked_tokens_reason.sql`: Added `revocation_reason` column to `app.revoked_tokens`.
    - `00034_deletion_lifecycle_policies.sql`: Added Row-Level Security policies for profile, workspace, membership, items, and receipt deletion.
    - `00035_repair_items_reassignment_policy.sql`: Set null foreign key handling on deleted profiles and allowed creator/owner item reassignment.
    - `00036_repair_items_select_policy.sql`: Ensured items select policy allows creator and workspace members access even when workspace context is unset.
  - **API Client (`packages/api-client/src/client.ts`)**:
    - Added `requestAccountDeletion`, `confirmAccountDeletion`, `cancelAccountDeletion`, `getAccountDeletionStatus`, `deleteWorkspace`, and `submitPublicDeletionRequest` to `DaynoriApiClient`.
  - **Web User Interface (`packages/ui-web`, `apps/web`)**:
    - Implemented `AccountDeletionDialog.tsx`: Accessible modal dialog with password verification, retention disclosure, deletion warnings, and confirmation buttons.
    - Wired into Web settings page (`apps/web/src/app/settings/page.tsx`).
    - Implemented public web deletion request page at `apps/web/src/app/account-deletion/page.tsx` compliant with Google Play Data Safety guidelines.
  - **Mobile User Interface (`packages/ui-mobile`, `apps/mobile`)**:
    - Implemented `MobileAccountDeletionSheet.tsx`: Accessible React Native bottom sheet with password reauthentication, retention notices, and Android Back button handling.
    - Wired into mobile settings view (`apps/mobile/src/views/SettingsView.tsx` and `apps/mobile/App.tsx`).
  - **Runbook & Architecture Documentation (`docs/engineering`, `docs/decisions`)**:
    - Authored authoritative runbook `docs/engineering/backup-and-recovery.md` detailing dual-layer backup architecture (PostgreSQL + S3), RPO/RTO targets, suppression ledger restoration drill procedures, and Google Play compliance review.
    - Recorded [ADR-0038: Account Deletion Lifecycle, Suppression Ledger, and Disaster Recovery Procedures](../decisions/0038-account-deletion-suppression-ledger-and-disaster-recovery.md).

## Verification results

1. **Automated Integration Suite (`tests/integration/phase36-deletion-recovery.test.ts`)**:
   - 20/20 tests passing:
     - Reauthentication enforcement: Rejects deletion requests without reauth (403), with invalid passwords, or with wrong-purpose tickets (`workspace_export`); accepts valid passwords and tickets bound to `account_deletion`.
     - Cancellation lifecycle: Verifies querying status of pending deletions, user-requested cancellation, and rejection of confirmation on cancelled requests.
     - Permanent account erasure: Confirms execution with confirmation token; asserts zero surviving rows for user profile, owned workspaces, notes, and tasks in PostgreSQL.
     - Storage purging: Asserts private file objects and export archives are deleted from storage provider.
     - Shared content preservation: Verifies that items created by the deleting user in shared collaborative workspaces are reassigned to the workspace owner (`created_by = w.owner_id`) and membership is removed.
     - Token revocation: Asserts session token is inserted into `app.revoked_tokens` and subsequent API requests with that token immediately fail with HTTP 401 Unauthorized.
     - Suppression ledger tombstones: Verifies content-free cryptographic tombstones for account and workspace exist in `app.deletion_suppression_ledger`.
     - Single workspace deletion: Verifies workspace owner Bob can delete secondary workspace B2 with password reauth, purging its items while keeping his profile and primary workspace B1 intact.
     - Disaster recovery restore drill: Simulates database restoration from an older snapshot resurrecting deleted profiles/workspaces, executes the authoritative ledger sanitization query, and verifies zero resurrected suppressed entities survive.
     - Worker blob purge: Verifies worker `blob_purge` job consumes payload paths and cleans up storage objects.
     - Public web deletion request: Verifies public enumeration-safe deletion submission and uniform disclosure response.
2. **Monorepo Integration Suite Verification (`pnpm test`)**:
   - 58/58 test files and 842/842 tests passing across all packages and applications.
3. **Type Checking & Linting**:
   - `pnpm typecheck`: Clean (exit code 0 across all 13 workspace projects).
   - `pnpm lint`: Clean (exit code 0 across entire monorepo).
4. **Planning & Secret Scanning Validation**:
   - `node scripts/validate-planning.mjs`: Clean (64 phases, 22 mapped requirements, 202 Markdown files verified).
   - `pnpm audit:secrets`: Clean (checked 1793 files without detecting unapproved secrets).

## Architecture Invariants & Defenses

- **Strict Scope Boundaries**: Account deletion permanently purges identity and owned workspaces; workspace deletion operates strictly on the targeted workspace, preserving account profile and other workspaces.
- **Fail-Closed Reauthentication**: Deletion actions require password verification against the active provider challenge or an HMAC-SHA256 signed ticket bound to user ID, active session hash, and deletion purpose with maximum 10-minute validity.
- **Token Revocation Ledger**: Session tokens are hashed via SHA-256 and checked by API middleware on every authenticated request, guaranteeing immediate revocation without waiting for JWT expiration.
- **Suppression Ledger Against Restoration Resurrection**: Content-free tombstones stored in `app.deletion_suppression_ledger` survive historical database restorations and are re-applied to purge resurrected records before service opening.
- **Shared Content Ownership Reassignment**: Deleting a user in a shared room reassigns items to the workspace owner, preventing broken foreign keys or orphaned collaborative records.
- **Dual-Layer Storage Purge**: Eliminates disconnect between relational metadata deletion and private object storage bytes via immediate provider deletion and background worker `blob_purge` jobs.
- **Google Play Policy Compliance**: Provides both in-app deletion paths and a dedicated public web resource (`/account-deletion`) protected against user enumeration.

## Blocked gates and hardware dependencies

- **Physical Android TalkBack & Native KeyStore**: Provisional mobile implementation verified in automated headless test suites; physical TalkBack screen-reader gesture navigation and physical KeyStore hardware verification remain recorded as blocked gates.
- **External Production Push Providers**: Production FCM and Mozilla push gateway credentials remain blocked external dependencies.
