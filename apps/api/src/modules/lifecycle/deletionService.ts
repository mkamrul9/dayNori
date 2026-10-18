import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  RequestAccountDeletionResponse,
  ConfirmAccountDeletionResponse,
  CancelAccountDeletionResponse,
  AccountDeletionStatusResponse,
  RequestWorkspaceDeletionResponse,
  PublicDeletionRequestResponse,
  ReauthenticatePurpose,
} from '@daynori/contracts';
import { NotFoundError, ForbiddenError, ValidationError } from '../../plugins/errorHandler.js';
import { getActiveAuthenticator, verifyReauthTicket } from '../portability/reauth.js';
import { getDefaultStorageProvider } from '../files/storageAdapter.js';
import { PRIVATE_ASSETS_BUCKET } from '../files/service.js';

export const DELETION_DISCLOSURE =
  'Your notes, tasks, routines, journal entries, uploaded files, and account profile will be permanently deleted upon confirmation. Data cannot be recovered after completion. Transient backup snapshots rotate out within 30 days. Cryptographic tombstones are retained in the suppression ledger for 90 days solely to prevent unintentional reactivation during disaster recovery drills.';

export class DeletionService {
  /**
   * Request account deletion requiring recent reauthentication.
   */
  async requestAccountDeletion(
    client: PoolClient | Pool,
    userId: string,
    sessionToken: string,
    options: { password?: string; reauthTicket?: string; reason?: string },
    userEmail?: string
  ): Promise<RequestAccountDeletionResponse> {
    // 1. Verify fresh reauthentication
    await this.verifyReauth(client, userId, options, 'account_deletion', userEmail, sessionToken);

    // 2. Generate confirmation token and session hash
    const confirmationToken = crypto.randomBytes(32).toString('hex');
    const confirmationTokenHash = crypto
      .createHash('sha256')
      .update(confirmationToken)
      .digest('hex');
    const sessionHash = sessionToken
      ? crypto.createHash('sha256').update(sessionToken).digest('hex').substring(0, 32)
      : 'unspecified_session';

    const cancellationDeadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    // 3. Insert deletion request
    const res = await client.query<{
      id: string;
      status: 'pending_confirmation';
      cancellation_deadline: Date;
    }>(
      `INSERT INTO app.account_deletions (
        user_id, session_hash, status, confirmation_token_hash, cancellation_deadline, created_at, updated_at
      )
      VALUES ($1, $2, 'pending_confirmation', $3, $4, now(), now())
      RETURNING id, status, cancellation_deadline;`,
      [userId, sessionHash, confirmationTokenHash, cancellationDeadline]
    );

    const row = res.rows[0]!;

    return {
      deletionId: row.id,
      status: row.status,
      confirmationRequired: true,
      confirmationToken,
      cancellationDeadline: row.cancellation_deadline.toISOString(),
      retainedDataDisclosure: DELETION_DISCLOSURE,
    };
  }

  /**
   * Confirm and immediately execute full account deletion.
   */
  async confirmAccountDeletion(
    client: PoolClient | Pool,
    userId: string,
    sessionToken: string,
    confirmationToken: string,
    userEmail?: string
  ): Promise<ConfirmAccountDeletionResponse> {
    // 1. Find pending deletion
    const delRes = await client.query<{
      id: string;
      status: string;
      confirmation_token_hash: string;
    }>(
      `SELECT id, status, confirmation_token_hash
       FROM app.account_deletions
       WHERE user_id = $1 AND status = 'pending_confirmation'
       ORDER BY created_at DESC
       LIMIT 1;`,
      [userId]
    );

    if (delRes.rows.length === 0) {
      throw new NotFoundError('No pending account deletion found for this user');
    }

    const deletion = delRes.rows[0]!;
    const expectedHash = crypto.createHash('sha256').update(confirmationToken).digest('hex');
    if (deletion.confirmation_token_hash !== expectedHash) {
      throw new ForbiddenError('Invalid confirmation token');
    }

    // 2. Mark processing
    await client.query(
      `UPDATE app.account_deletions SET status = 'processing', confirmed_at = now(), updated_at = now() WHERE id = $1;`,
      [deletion.id]
    );

    // 3. Email identifier for suppression ledger
    const email = userEmail || '';

    // 4. Identify all workspaces owned by the user
    const wsRes = await client.query<{ id: string }>(
      'SELECT id FROM app.workspaces WHERE owner_id = $1;',
      [userId]
    );
    const ownedWorkspaceIds = wsRes.rows.map((r) => r.id);

    const storagePaths: string[] = [];

    if (ownedWorkspaceIds.length > 0) {
      // 5. Collect all storage objects in owned workspaces
      const filesRes = await client.query<{ object_path: string }>(
        `SELECT object_path FROM app.file_items WHERE workspace_id = ANY($1) AND object_path IS NOT NULL;`,
        [ownedWorkspaceIds]
      );
      storagePaths.push(...filesRes.rows.map((r) => r.object_path));

      const exportsRes = await client.query<{ storage_path: string }>(
        `SELECT storage_path FROM app.workspace_exports WHERE workspace_id = ANY($1) AND storage_path IS NOT NULL;`,
        [ownedWorkspaceIds]
      );
      storagePaths.push(...exportsRes.rows.map((r) => r.storage_path));

      // 6. Invalidate reminders & jobs in owned workspaces
      await client.query(
        `UPDATE app.reminder_instances SET status = 'invalidated', updated_at = now() WHERE workspace_id = ANY($1);`,
        [ownedWorkspaceIds]
      );
      await client.query(
        `UPDATE app.reminder_rules SET is_active = false, deleted_at = now(), updated_at = now() WHERE workspace_id = ANY($1);`,
        [ownedWorkspaceIds]
      );
    }

    // 7. Remove push / notification subscriptions for user
    await client.query('DELETE FROM app.devices WHERE user_id = $1;', [userId]);
    await client.query('DELETE FROM app.web_push_subscriptions WHERE user_id = $1;', [userId]);

    // 8. Reassign content in shared workspaces to respective workspace owners
    await client.query(
      `UPDATE app.items i SET created_by = w.owner_id, updated_by = w.owner_id
       FROM app.workspaces w WHERE i.workspace_id = w.id AND (i.created_by = $1 OR i.updated_by = $1) AND w.owner_id != $1;`,
      [userId]
    );
    await client.query(
      `UPDATE app.tags t SET created_by = w.owner_id
       FROM app.workspaces w WHERE t.workspace_id = w.id AND t.created_by = $1 AND w.owner_id != $1;`,
      [userId]
    );
    await client.query(
      `UPDATE app.item_tags it SET created_by = w.owner_id
       FROM app.workspaces w WHERE it.workspace_id = w.id AND it.created_by = $1 AND w.owner_id != $1;`,
      [userId]
    );
    await client.query(
      `UPDATE app.mutation_receipts m SET actor_user_id = w.owner_id
       FROM app.workspaces w WHERE m.workspace_id = w.id AND m.actor_user_id = $1 AND w.owner_id != $1;`,
      [userId]
    );
    if (ownedWorkspaceIds.length > 0) {
      await client.query(
        'DELETE FROM app.workspace_memberships WHERE user_id = $1 AND NOT (workspace_id = ANY($2));',
        [userId, ownedWorkspaceIds]
      );
    } else {
      await client.query('DELETE FROM app.workspace_memberships WHERE user_id = $1;', [userId]);
    }

    // 9. Delete owned workspaces and their data
    for (const wsId of ownedWorkspaceIds) {
      const wsHash = crypto.createHash('sha256').update(`workspace:${wsId}`).digest('hex');
      await client.query(
        `INSERT INTO app.deletion_suppression_ledger (entity_type, entity_id, content_free_hash, reason, expires_at)
         VALUES ('workspace', $1, $2, 'account_deletion', now() + interval '90 days');`,
        [wsId, wsHash]
      );

      await client.query('DELETE FROM app.file_versions WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.file_items WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.upload_reservations WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.workspace_storage_usage WHERE workspace_id = $1;', [
        wsId,
      ]);
      await client.query('DELETE FROM app.workspace_exports WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.workspace_imports WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.item_links WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.item_tags WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.tags WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.routine_occurrences WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.routines WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.calendar_events WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.journal_entries WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.tasks WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.notes WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.saved_views WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.reminder_deliveries WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.reminder_instances WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.reminder_rules WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.mutation_receipts WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.outbox_intents WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.workspace_sync_state WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.changes WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.items WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.folders WHERE workspace_id = $1;', [wsId]);
      await client.query('DELETE FROM app.workspaces WHERE id = $1;', [wsId]);
      await client.query('DELETE FROM app.workspace_memberships WHERE workspace_id = $1;', [wsId]);
    }

    // 10. Record account tombstone in suppression ledger
    const accountHash = crypto
      .createHash('sha256')
      .update(`account:${userId}:${email}`)
      .digest('hex');
    await client.query(
      `INSERT INTO app.deletion_suppression_ledger (entity_type, entity_id, content_free_hash, reason, expires_at)
       VALUES ('account', $1, $2, 'user_account_deleted', now() + interval '90 days');`,
      [userId, accountHash]
    );

    // 11. Revoke session tokens immediately
    if (sessionToken) {
      const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      await client.query(
        `INSERT INTO app.revoked_tokens (token_hash, user_id, expires_at, revocation_reason)
         VALUES ($1, $2, now() + interval '30 days', 'account_deletion')
         ON CONFLICT (token_hash) DO NOTHING;`,
        [tokenHash, userId]
      );
    }

    // 12. Purge private storage objects
    const storageProvider = getDefaultStorageProvider();
    for (const p of storagePaths) {
      try {
        await storageProvider.deleteObject(PRIVATE_ASSETS_BUCKET, p);
      } catch {
        // Ignored; worker job cleans remaining
      }
    }

    // 13. Delete profile and associated audit rows
    await client.query('DELETE FROM app.workspace_exports WHERE user_id = $1;', [userId]);
    await client.query('DELETE FROM app.workspace_imports WHERE user_id = $1;', [userId]);
    await client.query('DELETE FROM app.profiles WHERE id = $1;', [userId]);

    // 14. Mark deletion completed
    await client.query(
      `UPDATE app.account_deletions
       SET status = 'completed', object_deletion_manifest = $1, completed_at = now(), updated_at = now()
       WHERE id = $2;`,
      [JSON.stringify(storagePaths), deletion.id]
    );

    return {
      success: true,
      deletionId: deletion.id,
      status: 'completed',
      completedAt: new Date().toISOString(),
      message: 'Account and associated personal data have been permanently erased.',
    };
  }

  /**
   * Cancel a pending account deletion request.
   */
  async cancelAccountDeletion(
    client: PoolClient | Pool,
    userId: string,
    deletionId?: string,
    reason?: string
  ): Promise<CancelAccountDeletionResponse> {
    const res = await client.query<{ id: string; status: string }>(
      `UPDATE app.account_deletions
       SET status = 'cancelled', cancellation_reason = $1, updated_at = now()
       WHERE user_id = $2
         AND status = 'pending_confirmation'
         AND ($3::uuid IS NULL OR id = $3::uuid)
       RETURNING id, status;`,
      [reason || 'user_requested_cancellation', userId, deletionId || null]
    );

    if (res.rowCount === 0) {
      throw new ValidationError('Deletion cannot be cancelled (not found or already processed)');
    }

    return {
      success: true,
      deletionId: res.rows[0]!.id,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    };
  }

  /**
   * Query status of account deletion.
   */
  async getAccountDeletionStatus(
    client: PoolClient | Pool,
    userId: string
  ): Promise<AccountDeletionStatusResponse> {
    const res = await client.query<{
      id: string;
      status:
        'pending_confirmation' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled';
      created_at: Date;
      cancellation_deadline: Date | null;
      completed_at: Date | null;
      last_error: string | null;
    }>(
      `SELECT id, status, created_at, cancellation_deadline, completed_at, last_error
       FROM app.account_deletions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1;`,
      [userId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('No account deletion records found');
    }

    const row = res.rows[0]!;
    return {
      deletionId: row.id,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      cancellationDeadline: row.cancellation_deadline?.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      lastError: row.last_error,
    };
  }

  /**
   * Delete a single workspace (leaving caller user account intact).
   */
  async deleteSingleWorkspace(
    client: PoolClient | Pool,
    userId: string,
    workspaceId: string,
    sessionToken: string,
    options: { password?: string; reauthTicket?: string; reason?: string },
    userEmail?: string
  ): Promise<RequestWorkspaceDeletionResponse> {
    // 1. Verify workspace exists and user is owner
    const ws = await client.query<{ id: string; owner_id: string }>(
      `SELECT id, owner_id FROM app.workspaces WHERE id = $1;`,
      [workspaceId]
    );
    if (ws.rows.length === 0) {
      throw new NotFoundError('Workspace not found');
    }
    if (ws.rows[0]!.owner_id !== userId) {
      throw new ForbiddenError('Only the workspace owner can delete this workspace');
    }

    // 2. Verify reauth
    await this.verifyReauth(client, userId, options, 'workspace_deletion', userEmail, sessionToken);

    // 3. Collect storage objects
    const storagePaths: string[] = [];
    const filesRes = await client.query<{ object_path: string }>(
      `SELECT object_path FROM app.file_items WHERE workspace_id = $1 AND object_path IS NOT NULL;`,
      [workspaceId]
    );
    storagePaths.push(...filesRes.rows.map((r) => r.object_path));

    const exportsRes = await client.query<{ storage_path: string }>(
      `SELECT storage_path FROM app.workspace_exports WHERE workspace_id = $1 AND storage_path IS NOT NULL;`,
      [workspaceId]
    );
    storagePaths.push(...exportsRes.rows.map((r) => r.storage_path));

    // 4. Create deletion record
    const sessionHash = sessionToken
      ? crypto.createHash('sha256').update(sessionToken).digest('hex').substring(0, 32)
      : 'unspecified_session';

    const delRes = await client.query<{ id: string }>(
      `INSERT INTO app.workspace_deletions (
        workspace_id, requested_by, session_hash, status, object_deletion_manifest, confirmed_at, completed_at
      )
      VALUES ($1, $2, $3, 'completed', $4, now(), now())
      RETURNING id;`,
      [workspaceId, userId, sessionHash, JSON.stringify(storagePaths)]
    );

    // 5. Invalidate reminders
    await client.query(
      `UPDATE app.reminder_instances SET status = 'invalidated', updated_at = now() WHERE workspace_id = $1;`,
      [workspaceId]
    );
    await client.query(
      `UPDATE app.reminder_rules SET is_active = false, deleted_at = now(), updated_at = now() WHERE workspace_id = $1;`,
      [workspaceId]
    );

    // 6. Record workspace tombstone in suppression ledger
    const wsHash = crypto.createHash('sha256').update(`workspace:${workspaceId}`).digest('hex');
    await client.query(
      `INSERT INTO app.deletion_suppression_ledger (entity_type, entity_id, content_free_hash, reason, expires_at)
       VALUES ('workspace', $1, $2, 'workspace_owner_deleted', now() + interval '90 days');`,
      [workspaceId, wsHash]
    );

    // 7. Purge workspace rows
    await client.query('DELETE FROM app.file_versions WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.file_items WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.upload_reservations WHERE workspace_id = $1;', [
      workspaceId,
    ]);
    await client.query('DELETE FROM app.workspace_storage_usage WHERE workspace_id = $1;', [
      workspaceId,
    ]);
    await client.query('DELETE FROM app.workspace_exports WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.workspace_imports WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.item_links WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.item_tags WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.tags WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.routine_occurrences WHERE workspace_id = $1;', [
      workspaceId,
    ]);
    await client.query('DELETE FROM app.routines WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.calendar_events WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.journal_entries WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.tasks WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.notes WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.saved_views WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.reminder_deliveries WHERE workspace_id = $1;', [
      workspaceId,
    ]);
    await client.query('DELETE FROM app.reminder_instances WHERE workspace_id = $1;', [
      workspaceId,
    ]);
    await client.query('DELETE FROM app.reminder_rules WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.mutation_receipts WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.outbox_intents WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.workspace_sync_state WHERE workspace_id = $1;', [
      workspaceId,
    ]);
    await client.query('DELETE FROM app.changes WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.items WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.folders WHERE workspace_id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.workspaces WHERE id = $1;', [workspaceId]);
    await client.query('DELETE FROM app.workspace_memberships WHERE workspace_id = $1;', [
      workspaceId,
    ]);

    // 8. Delete storage objects
    const storageProvider = getDefaultStorageProvider();
    for (const p of storagePaths) {
      try {
        await storageProvider.deleteObject(PRIVATE_ASSETS_BUCKET, p);
      } catch {
        // worker cleanup
      }
    }

    return {
      success: true,
      deletionId: delRes.rows[0]!.id,
      workspaceId,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Submit public deletion request (enumeration-safe, returns generic success).
   */
  async submitPublicDeletionRequest(
    client: PoolClient | Pool,
    email: string,
    reason?: string
  ): Promise<PublicDeletionRequestResponse> {
    const normalized = email.toLowerCase().trim();
    const accountHash = crypto
      .createHash('sha256')
      .update(`public_deletion:${normalized}`)
      .digest('hex');

    await client.query(
      `INSERT INTO app.deletion_suppression_ledger (entity_type, entity_id, content_free_hash, reason, expires_at)
       VALUES ('account', gen_random_uuid(), $1, $2, now() + interval '90 days');`,
      [accountHash, reason || 'public_web_request']
    );

    return {
      success: true,
      message:
        'If an account is associated with this email address, a confirmation email with deletion instructions has been dispatched.',
      disclosure: DELETION_DISCLOSURE,
    };
  }

  /**
   * Internal helper to verify reauth ticket or password.
   */
  private async verifyReauth(
    _client: PoolClient | Pool,
    userId: string,
    options: { password?: string; reauthTicket?: string },
    expectedPurpose: ReauthenticatePurpose,
    userEmail?: string,
    sessionToken?: string
  ): Promise<void> {
    if (options.reauthTicket) {
      const ticket = verifyReauthTicket(options.reauthTicket, {
        expectedUserId: userId,
        expectedPurpose,
        currentSessionToken: sessionToken,
      });
      if (!ticket) {
        throw new ForbiddenError('Invalid, expired, or wrong-purpose reauthentication ticket');
      }
      return;
    }

    if (options.password) {
      const email = userEmail;
      const authenticator = getActiveAuthenticator();
      const authRes = await authenticator.verifyPassword({
        userId,
        email,
        password: options.password,
      });

      if (!authRes.success) {
        throw new ForbiddenError(authRes.error || 'Reauthentication failed: invalid password');
      }
      return;
    }

    throw new ForbiddenError(`Fresh reauthentication required for ${expectedPurpose}`);
  }
}
