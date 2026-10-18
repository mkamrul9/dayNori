# ADR-0038: Account Deletion Lifecycle, Suppression Ledger, and Disaster Recovery Procedures

## Status

Accepted (Phase 36 implementation verified across web and mobile platforms with reauthentication enforcement, session token revocation, deletion suppression ledger, storage object purging, and disaster recovery restore drill; physical Android accessibility TalkBack and production external services remain explicit blocked release gates).

## Context

Phase 36 establishes the account deletion backup and recovery lifecycle ([docs/roadmap/phases/36-account-deletion-backup-and-recovery-lifecycle.md](../roadmap/phases/36-account-deletion-backup-and-recovery-lifecycle.md)). Users must have complete, transparent control over their personal data, including permanent deletion of accounts or individual workspaces. Furthermore, disaster recovery procedures (e.g. restoring older database snapshots) must not resurrect previously deleted accounts or reactivate stale notifications, in compliance with privacy commitments and Google Play Developer guidelines.

Key architectural challenges and invariants addressed in this ADR:

1. **Strict Scope Separation: Account Deletion vs. Single Workspace Deletion**:
   - Deleting a single workspace deletes only that workspace's items, attachments, routine occurrences, and sync records, while leaving the user's account profile and other personal/shared workspaces intact. Only the verified workspace owner can delete a workspace.
   - Deleting an account permanently purges the user profile, all owned workspaces, active sessions, push notification registrations, and reminder schedules.

2. **Mandatory Fresh Reauthentication & Session Binding**:
   - All destructive deletion requests require recent verification (within 10 minutes) via bound provider password challenge or signed ephemeral reauthentication ticket (`verifyReauthTicket`).
   - Proof of reauthentication is strictly bound to the authenticated actor user ID, active session hash, and explicit purpose (`account_deletion` or `workspace_deletion`). Stale or cross-purpose tickets fail closed.

3. **Two-Step Confirmation State Machine (`app.account_deletions`)**:
   - Initial deletion request produces a pending deletion record with a 24-hour cancellation deadline and a high-entropy confirmation token.
   - Confirmation requires submitting the matching confirmation token before the cancellation deadline. Users may cancel a pending deletion at any point prior to confirmation.
   - Confirmation transitions state irreversibly to `processing` and immediately executes complete data erasure.

4. **Immediate Session Invalidation & Notification Suppression**:
   - Upon confirmation, active session tokens are hashed via SHA-256 and inserted into `app.revoked_tokens`. API middleware rejects subsequent requests with `401 Unauthorized` (`TOKEN_REVOKED`).
   - Device registrations in `app.devices` and Web Push subscriptions in `app.web_push_subscriptions` are permanently deleted.
   - Scheduled reminder instances in `app.reminder_instances` are invalidated and reminder rules are deactivated.

5. **Shared Content Ownership Reassignment**:
   - In shared collaborative workspaces owned by another user, items, folders, and tags created by the deleting user are reassigned to the workspace owner (`created_by = w.owner_id`) to prevent orphan records or broken hierarchies for remaining collaborators.
   - The deleting user's workspace membership is permanently revoked.

6. **Dual-Layer Physical Storage Purge**:
   - Relational database records are deleted transactionally in dependency order.
   - Private storage objects (uploaded file attachments and export archives) in `PRIVATE_ASSETS_BUCKET` are purged immediately via the storage provider, with residual paths recorded in `object_deletion_manifest` and enqueued for background worker cleanup via `blob_purge` jobs.

7. **Deletion Suppression Ledger against Restoration Resurrection**:
   - To prevent historical database backup restores from unintentionally resurrecting deleted accounts or reactivating stale sessions, a content-free cryptographic hash (tombstone) is inserted into `app.deletion_suppression_ledger` with a 90-day retention window (exceeding the 30-day automated backup snapshot rotation period).
   - The disaster recovery runbook mandates re-applying active suppression ledger entries immediately after restoring a snapshot and executing the ledger sanitization query before opening API access.

8. **Google Play Policy Compliance & Public Web Deletion Resource**:
   - Accessible in-app deletion flows on Web (`AccountDeletionDialog`) and Mobile (`MobileAccountDeletionSheet`).
   - A dedicated public web resource at `/account-deletion` allows users who have uninstalled the app to submit an account deletion request.
   - The public endpoint is enumeration-safe, returning a uniform success disclosure message regardless of whether the submitted email address exists.

## Consequences

- Permanent account deletion cannot be executed accidentally or via stale credentials.
- Users who deleted their accounts cannot continue accessing data through cached tokens or background sync.
- Disaster recovery restore drills maintain data minimization and respect historical deletion events without data resurrection.
- Full transparency with users: retention disclosure explains that personal content is immediately erased, automated database snapshots rotate out within 30 days, and content-free suppression tombstones expire in 90 days.
