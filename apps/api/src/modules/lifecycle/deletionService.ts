import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  RequestAccountDeletionResponse,
  ConfirmAccountDeletionResponse,
  CancelAccountDeletionResponse,
  AccountDeletionStatusResponse,
  RequestWorkspaceDeletionResponse,
  PublicDeletionRequestResponse,
  VerifyPublicDeletionResponse,
  ReauthenticatePurpose,
} from '@daynori/contracts';
import { NotFoundError, ForbiddenError, ValidationError } from '../../plugins/errorHandler.js';
import { getActiveAuthenticator, verifyReauthTicket } from '../portability/reauth.js';
import { getDefaultStorageProvider } from '../files/storageAdapter.js';
import { PRIVATE_ASSETS_BUCKET } from '../files/service.js';
import { withUserContext } from '../../db/index.js';

export const DELETION_DISCLOSURE =
  'Your notes, tasks, routines, journal entries, uploaded files, and account profile will be permanently deleted upon confirmation. Data cannot be recovered after completion. Transient backup snapshots rotate out within 30 days. Cryptographic tombstones are retained in the suppression ledger for 90 days solely to prevent unintentional reactivation during disaster recovery drills.';

export interface DeletionEmailDelivery {
  sendVerificationEmail(toEmail: string, requestId: string, token: string): Promise<void>;
}

export class InMemoryDeletionEmailDelivery implements DeletionEmailDelivery {
  private dispatches: Array<{
    toEmail: string;
    requestId: string;
    token: string;
    timestamp: string;
  }> = [];

  async sendVerificationEmail(toEmail: string, requestId: string, token: string): Promise<void> {
    this.dispatches.push({ toEmail, requestId, token, timestamp: new Date().toISOString() });
  }

  getLastDispatch(toEmail?: string) {
    if (toEmail) {
      return [...this.dispatches]
        .reverse()
        .find((d) => d.toEmail.toLowerCase() === toEmail.toLowerCase());
    }
    return this.dispatches[this.dispatches.length - 1];
  }

  clear(): void {
    this.dispatches = [];
  }
}

export class OutboxDeletionEmailDelivery implements DeletionEmailDelivery {
  constructor(private pool: Pool | PoolClient) {}

  async sendVerificationEmail(toEmail: string, requestId: string, token: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO app.background_jobs (task_type, payload, run_at, status, created_at, updated_at)
       VALUES ('deletion_verification_email', $1, now(), 'pending', now(), now());`,
      [JSON.stringify({ toEmail, requestId, token })]
    );
  }
}

export const defaultEmailDelivery = new InMemoryDeletionEmailDelivery();

export class DeletionService {
  constructor(private emailDelivery: DeletionEmailDelivery = defaultEmailDelivery) {}

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
   * Attempts immediate external provider session revocation, user deletion, and storage blob purge outside the DB transaction.
   * Never throws; returns inspectable results so calling code can record truthful completion.
   */
  async performExternalCleanup(
    userId: string,
    storagePaths: string[]
  ): Promise<{
    providerRevocationSuccess: boolean;
    providerDeletionSuccess: boolean;
    storagePurgeSuccess: boolean;
    allSucceeded: boolean;
    lastError?: string;
  }> {
    let providerRevocationSuccess = true;
    let providerDeletionSuccess = true;
    let storagePurgeSuccess = true;
    let lastError: string | undefined;

    const authenticator = getActiveAuthenticator();
    if (authenticator.revokeUserSessions) {
      try {
        await authenticator.revokeUserSessions(userId);
      } catch (err) {
        providerRevocationSuccess = false;
        lastError = `Provider session revocation failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (authenticator.deleteUser) {
      try {
        await authenticator.deleteUser(userId);
      } catch (err) {
        providerDeletionSuccess = false;
        if (!lastError) {
          lastError = `Provider user deletion failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    }

    const storageProvider = getDefaultStorageProvider();
    for (const p of storagePaths) {
      try {
        await storageProvider.deleteObject(PRIVATE_ASSETS_BUCKET, p);
      } catch (err) {
        storagePurgeSuccess = false;
        if (!lastError) {
          lastError = `Storage purge failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    }

    const allSucceeded =
      providerRevocationSuccess && providerDeletionSuccess && storagePurgeSuccess;
    return {
      providerRevocationSuccess,
      providerDeletionSuccess,
      storagePurgeSuccess,
      allSucceeded,
      lastError,
    };
  }

  /**
   * Transactional phase: validates request, transitions status to 'processing',
   * purges relational data, records suppression tombstones, and enqueues durable
   * blob_purge and provider_user_purge background jobs.
   */
  async executeAccountDeletionTransaction(
    client: PoolClient | Pool,
    userId: string,
    sessionToken: string,
    confirmationToken: string,
    userEmail?: string
  ): Promise<{
    deletionId: string;
    status?: string;
    alreadyCompleted: boolean;
    completedAt?: string;
    storagePaths: string[];
  }> {
    // 1. Find pending deletion
    const delRes = await client.query<{
      id: string;
      session_hash: string;
      status: string;
      confirmation_token_hash: string;
      cancellation_deadline: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, session_hash, status, confirmation_token_hash, cancellation_deadline, completed_at
       FROM app.account_deletions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1;`,
      [userId]
    );

    if (delRes.rows.length === 0) {
      throw new NotFoundError('No pending account deletion found for this user');
    }

    const deletion = delRes.rows[0]!;

    // Idempotent retry: distinguish completed from processing
    if (deletion.status === 'completed') {
      return {
        deletionId: deletion.id,
        status: 'completed',
        alreadyCompleted: true,
        completedAt: deletion.completed_at
          ? deletion.completed_at.toISOString()
          : undefined,
        storagePaths: [],
      };
    }

    if (deletion.status === 'processing') {
      return {
        deletionId: deletion.id,
        status: 'processing',
        alreadyCompleted: false,
        completedAt: undefined,
        storagePaths: [],
      };
    }

    if (deletion.status === 'cancelled') {
      throw new ValidationError('Account deletion request has been cancelled');
    }

    if (deletion.status !== 'pending_confirmation') {
      throw new ValidationError(
        `Account deletion cannot be confirmed from status '${deletion.status}'`
      );
    }

    // Verify confirmation token
    const expectedTokenHash = crypto.createHash('sha256').update(confirmationToken).digest('hex');
    if (deletion.confirmation_token_hash !== expectedTokenHash) {
      throw new ForbiddenError('Invalid confirmation token');
    }

    // Verify initiating session hash
    const currentSessionHash = sessionToken
      ? crypto.createHash('sha256').update(sessionToken).digest('hex').substring(0, 32)
      : 'unspecified_session';
    if (deletion.session_hash !== currentSessionHash) {
      throw new ForbiddenError('Account deletion must be confirmed from the initiating session');
    }

    // Verify cancellation deadline freshness
    if (new Date(deletion.cancellation_deadline).getTime() < Date.now()) {
      throw new ValidationError(
        'Deletion confirmation deadline has expired; please request deletion again'
      );
    }

    // Atomic transition: pending_confirmation -> processing
    const updateRes = await client.query<{ id: string }>(
      `UPDATE app.account_deletions
       SET status = 'processing', confirmed_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'pending_confirmation'
       RETURNING id;`,
      [deletion.id]
    );

    if (updateRes.rows.length === 0) {
      const raceRes = await client.query<{ status: string; completed_at: Date | null }>(
        `SELECT status, completed_at FROM app.account_deletions WHERE id = $1;`,
        [deletion.id]
      );
      if (raceRes.rows[0]?.status === 'completed' || raceRes.rows[0]?.status === 'processing') {
        return {
          deletionId: deletion.id,
          alreadyCompleted: true,
          completedAt: raceRes.rows[0].completed_at?.toISOString() || new Date().toISOString(),
          storagePaths: [],
        };
      }
      throw new ValidationError(
        'Concurrent deletion confirmation in progress or already processed'
      );
    }

    // Execute direct relational account purge + enqueue cleanup jobs
    const storagePaths = await this.executeDirectAccountPurge(
      client,
      userId,
      userEmail,
      'user_account_deleted',
      sessionToken,
      deletion.id
    );

    // Save deletion manifest while remaining in 'processing' status
    await client.query(
      `UPDATE app.account_deletions
       SET object_deletion_manifest = $1, updated_at = now()
       WHERE id = $2;`,
      [JSON.stringify(storagePaths), deletion.id]
    );

    return {
      deletionId: deletion.id,
      status: 'processing',
      alreadyCompleted: false,
      completedAt: undefined,
      storagePaths,
    };
  }

  /**
   * Durable account deletion: executes database transaction first, commits,
   * then performs external provider/storage cleanup outside the transaction.
   */
  async confirmAccountDeletionWithPool(
    pool: Pool,
    userId: string,
    sessionToken: string,
    confirmationToken: string,
    userEmail?: string
  ): Promise<ConfirmAccountDeletionResponse> {
    const txResult = await withUserContext(pool, userId, async (client) => {
      return this.executeAccountDeletionTransaction(
        client,
        userId,
        sessionToken,
        confirmationToken,
        userEmail
      );
    });

    if (txResult.alreadyCompleted || txResult.status === 'completed') {
      return {
        success: true,
        deletionId: txResult.deletionId,
        status: 'completed',
        completedAt: txResult.completedAt || new Date().toISOString(),
        message: 'Account and associated personal data have been permanently erased.',
      };
    }

    if (txResult.status === 'processing' && txResult.storagePaths.length === 0) {
      return {
        success: true,
        deletionId: txResult.deletionId,
        status: 'processing',
        completedAt: undefined,
        message:
          'Account relational data permanently erased; external provider and storage cleanup jobs are running in background.',
      };
    }

    // Irreversible external effects executed OUTSIDE the database transaction
    const cleanup = await this.performExternalCleanup(userId, txResult.storagePaths);

    if (cleanup.allSucceeded) {
      await withUserContext(pool, userId, async (client) => {
        await client.query(
          `UPDATE app.account_deletions
           SET status = 'completed', completed_at = now(), updated_at = now()
           WHERE id = $1;`,
          [txResult.deletionId]
        );
      });

      return {
        success: true,
        deletionId: txResult.deletionId,
        status: 'completed',
        completedAt: new Date().toISOString(),
        message: 'Account and associated personal data have been permanently erased.',
      };
    }

    // Cleanup incomplete or failed: remain in 'processing' with last_error persisted for background retries
    await withUserContext(pool, userId, async (client) => {
      await client.query(
        `UPDATE app.account_deletions
         SET last_error = $1, updated_at = now()
         WHERE id = $2;`,
        [cleanup.lastError || 'External provider or storage cleanup pending', txResult.deletionId]
      );
    });

    return {
      success: true,
      deletionId: txResult.deletionId,
      status: 'processing',
      completedAt: undefined,
      message:
        'Account relational data permanently erased; external provider and storage cleanup jobs are running in background.',
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
    const txResult = await this.executeAccountDeletionTransaction(
      client,
      userId,
      sessionToken,
      confirmationToken,
      userEmail
    );

    if (txResult.alreadyCompleted || txResult.status === 'completed') {
      return {
        success: true,
        deletionId: txResult.deletionId,
        status: 'completed',
        completedAt: txResult.completedAt || new Date().toISOString(),
        message: 'Account and associated personal data have been permanently erased.',
      };
    }

    if (txResult.status === 'processing' && txResult.storagePaths.length === 0) {
      return {
        success: true,
        deletionId: txResult.deletionId,
        status: 'processing',
        completedAt: undefined,
        message:
          'Account relational data permanently erased; external provider and storage cleanup jobs are running in background.',
      };
    }

    const cleanup = await this.performExternalCleanup(userId, txResult.storagePaths);

    if (cleanup.allSucceeded) {
      await client.query(
        `UPDATE app.account_deletions
         SET status = 'completed', completed_at = now(), updated_at = now()
         WHERE id = $1;`,
        [txResult.deletionId]
      );

      return {
        success: true,
        deletionId: txResult.deletionId,
        status: 'completed',
        completedAt: new Date().toISOString(),
        message: 'Account and associated personal data have been permanently erased.',
      };
    }

    await client.query(
      `UPDATE app.account_deletions
       SET last_error = $1, updated_at = now()
       WHERE id = $2;`,
      [cleanup.lastError || 'External provider or storage cleanup pending', txResult.deletionId]
    );

    return {
      success: true,
      deletionId: txResult.deletionId,
      status: 'processing',
      completedAt: undefined,
      message:
        'Account relational data permanently erased; external provider and storage cleanup jobs are running in background.',
    };
  }

  /**
   * Core account purge routine shared by direct confirmation and verified public requests.
   */
  private async executeDirectAccountPurge(
    client: PoolClient | Pool,
    userId: string,
    userEmail?: string,
    reason = 'account_deletion',
    sessionToken?: string,
    deletionId?: string
  ): Promise<string[]> {
    const email = userEmail || '';

    // 1. Identify all workspaces owned by the user
    const wsRes = await client.query<{ id: string }>(
      'SELECT id FROM app.workspaces WHERE owner_id = $1;',
      [userId]
    );
    const ownedWorkspaceIds = wsRes.rows.map((r) => r.id);

    const storagePaths: string[] = [];

    if (ownedWorkspaceIds.length > 0) {
      // 2. Collect all storage objects in owned workspaces (files, versions, uploads, exports, imports)
      const filesRes = await client.query<{ object_path: string }>(
        `SELECT object_path FROM app.file_items WHERE workspace_id = ANY($1) AND object_path IS NOT NULL;`,
        [ownedWorkspaceIds]
      );
      storagePaths.push(...filesRes.rows.map((r) => r.object_path));

      const versionsRes = await client.query<{ object_path: string }>(
        `SELECT object_path FROM app.file_versions WHERE workspace_id = ANY($1) AND object_path IS NOT NULL;`,
        [ownedWorkspaceIds]
      );
      storagePaths.push(...versionsRes.rows.map((r) => r.object_path));

      const uploadsRes = await client.query<{ object_path: string }>(
        `SELECT object_path FROM app.upload_reservations WHERE workspace_id = ANY($1) AND object_path IS NOT NULL;`,
        [ownedWorkspaceIds]
      );
      storagePaths.push(...uploadsRes.rows.map((r) => r.object_path));

      const exportsRes = await client.query<{ storage_path: string }>(
        `SELECT storage_path FROM app.workspace_exports WHERE workspace_id = ANY($1) AND storage_path IS NOT NULL;`,
        [ownedWorkspaceIds]
      );
      storagePaths.push(...exportsRes.rows.map((r) => r.storage_path));

      const importsRes = await client.query<{ storage_path: string }>(
        `SELECT storage_path FROM app.workspace_imports WHERE workspace_id = ANY($1) AND storage_path IS NOT NULL;`,
        [ownedWorkspaceIds]
      );
      storagePaths.push(...importsRes.rows.map((r) => r.storage_path));

      // 3. Invalidate reminders & jobs in owned workspaces
      await client.query(
        `UPDATE app.reminder_instances SET status = 'invalidated', updated_at = now() WHERE workspace_id = ANY($1);`,
        [ownedWorkspaceIds]
      );
      await client.query(
        `UPDATE app.reminder_rules SET is_active = false, deleted_at = now(), updated_at = now() WHERE workspace_id = ANY($1);`,
        [ownedWorkspaceIds]
      );
      await client.query(
        `UPDATE app.background_jobs SET status = 'failed', last_error = 'Purged due to account deletion', updated_at = now()
         WHERE (payload->>'workspaceId' = ANY($1) OR payload->>'workspace_id' = ANY($1) OR payload->>'userId' = $2)
           AND status IN ('pending', 'running');`,
        [ownedWorkspaceIds, userId]
      );
    }

    // User-scoped exports and imports
    const userExports = await client.query<{ storage_path: string }>(
      `SELECT storage_path FROM app.workspace_exports WHERE user_id = $1 AND storage_path IS NOT NULL;`,
      [userId]
    );
    storagePaths.push(...userExports.rows.map((r) => r.storage_path));

    const userImports = await client.query<{ storage_path: string }>(
      `SELECT storage_path FROM app.workspace_imports WHERE user_id = $1 AND storage_path IS NOT NULL;`,
      [userId]
    );
    storagePaths.push(...userImports.rows.map((r) => r.storage_path));

    // 4. Remove push / notification subscriptions for user
    await client.query('DELETE FROM app.devices WHERE user_id = $1;', [userId]);
    await client.query('DELETE FROM app.web_push_subscriptions WHERE user_id = $1;', [userId]);

    // 5. Reassign content in shared collaborative workspaces via Security Definer procedure
    // (Preserves mutation_receipts provenance and does not rewrite actor identity)
    await client.query('SELECT app.reassign_shared_workspace_content($1);', [userId]);

    // 6. Delete memberships of this user
    await client.query('DELETE FROM app.workspace_memberships WHERE user_id = $1;', [userId]);

    // 7. Purge owned workspaces and record tombstones via Security Definer procedure
    for (const wsId of ownedWorkspaceIds) {
      const wsHash = crypto.createHash('sha256').update(`workspace:${wsId}`).digest('hex');
      await client.query(
        `SELECT app.record_deletion_tombstone('workspace', $1, $2, 'account_deletion');`,
        [wsId, wsHash]
      );
      await client.query('SELECT app.purge_owned_workspace($1, $2);', [wsId, userId]);
    }

    // 8. Record account tombstone in suppression ledger
    const accountHash = crypto
      .createHash('sha256')
      .update(`account:${userId}:${email}`)
      .digest('hex');
    await client.query(`SELECT app.record_deletion_tombstone('account', $1, $2, $3);`, [
      userId,
      accountHash,
      reason,
    ]);

    // 9. Record revoked session tokens
    if (sessionToken) {
      const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      await client.query(`SELECT app.record_revoked_token($1, $2, 'account_deletion');`, [
        tokenHash,
        userId,
      ]);
    }

    // 10. Enqueue durable blob purge background job before external effects
    if (storagePaths.length > 0) {
      await client.query(
        `INSERT INTO app.background_jobs (task_type, payload, run_at, status, created_at, updated_at)
         VALUES ('blob_purge', $1, now(), 'pending', now(), now());`,
        [JSON.stringify({ storagePaths, bucket: PRIVATE_ASSETS_BUCKET, deletionId })]
      );
    }

    // 11. Enqueue durable provider user purge background job
    await client.query(
      `INSERT INTO app.background_jobs (task_type, payload, run_at, status, created_at, updated_at)
       VALUES ('provider_user_purge', $1, now(), 'pending', now(), now());`,
      [JSON.stringify({ userId, userEmail: email, reason, deletionId })]
    );

    // 12. Purge profile, memberships, devices, and user audit rows via Security Definer procedure
    await client.query('SELECT app.purge_user_profile($1);', [userId]);

    return storagePaths;
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
   * Transactional phase: validates ownership, reauth, creates workspace_deletions in 'processing',
   * invalidates reminders/jobs, enqueues blob_purge job, records suppression tombstone,
   * and purges workspace relational rows via Security Definer procedure.
   */
  async executeWorkspaceDeletionTransaction(
    client: PoolClient | Pool,
    userId: string,
    workspaceId: string,
    sessionToken: string,
    options: { password?: string; reauthTicket?: string; reason?: string },
    userEmail?: string
  ): Promise<{ deletionId: string; storagePaths: string[] }> {
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

    // 2. Verify reauth with explicit expectedWorkspaceId binding
    await this.verifyReauth(
      client,
      userId,
      options,
      'workspace_deletion',
      userEmail,
      sessionToken,
      workspaceId
    );

    // 3. Collect storage objects in this workspace
    const storagePaths: string[] = [];
    const filesRes = await client.query<{ object_path: string }>(
      `SELECT object_path FROM app.file_items WHERE workspace_id = $1 AND object_path IS NOT NULL;`,
      [workspaceId]
    );
    storagePaths.push(...filesRes.rows.map((r) => r.object_path));

    const versionsRes = await client.query<{ object_path: string }>(
      `SELECT object_path FROM app.file_versions WHERE workspace_id = $1 AND object_path IS NOT NULL;`,
      [workspaceId]
    );
    storagePaths.push(...versionsRes.rows.map((r) => r.object_path));

    const uploadsRes = await client.query<{ object_path: string }>(
      `SELECT object_path FROM app.upload_reservations WHERE workspace_id = $1 AND object_path IS NOT NULL;`,
      [workspaceId]
    );
    storagePaths.push(...uploadsRes.rows.map((r) => r.object_path));

    const exportsRes = await client.query<{ storage_path: string }>(
      `SELECT storage_path FROM app.workspace_exports WHERE workspace_id = $1 AND storage_path IS NOT NULL;`,
      [workspaceId]
    );
    storagePaths.push(...exportsRes.rows.map((r) => r.storage_path));

    const importsRes = await client.query<{ storage_path: string }>(
      `SELECT storage_path FROM app.workspace_imports WHERE workspace_id = $1 AND storage_path IS NOT NULL;`,
      [workspaceId]
    );
    storagePaths.push(...importsRes.rows.map((r) => r.storage_path));

    // 4. Create deletion record in 'processing' status
    const sessionHash = sessionToken
      ? crypto.createHash('sha256').update(sessionToken).digest('hex').substring(0, 32)
      : 'unspecified_session';

    const delRes = await client.query<{ id: string }>(
      `INSERT INTO app.workspace_deletions (
        workspace_id, requested_by, session_hash, status, object_deletion_manifest
      )
      VALUES ($1, $2, $3, 'pending_confirmation', $4)
      RETURNING id;`,
      [workspaceId, userId, sessionHash, JSON.stringify(storagePaths)]
    );

    const deletionId = delRes.rows[0]!.id;

    await client.query(
      `UPDATE app.workspace_deletions
       SET status = 'processing', confirmed_at = now(), updated_at = now()
       WHERE id = $1;`,
      [deletionId]
    );

    // 5. Invalidate reminders & background jobs
    await client.query(
      `UPDATE app.reminder_instances SET status = 'invalidated', updated_at = now() WHERE workspace_id = $1;`,
      [workspaceId]
    );
    await client.query(
      `UPDATE app.reminder_rules SET is_active = false, deleted_at = now(), updated_at = now() WHERE workspace_id = $1;`,
      [workspaceId]
    );
    await client.query(
      `UPDATE app.background_jobs SET status = 'failed', last_error = 'Workspace purged', updated_at = now()
       WHERE (payload->>'workspaceId' = $1 OR payload->>'workspace_id' = $1)
         AND status IN ('pending', 'running');`,
      [workspaceId]
    );

    // 6. Enqueue durable blob purge background job
    if (storagePaths.length > 0) {
      await client.query(
        `INSERT INTO app.background_jobs (task_type, payload, run_at, status, created_at, updated_at)
         VALUES ('blob_purge', $1, now(), 'pending', now(), now());`,
        [
          JSON.stringify({
            storagePaths,
            bucket: PRIVATE_ASSETS_BUCKET,
            workspaceDeletionId: deletionId,
          }),
        ]
      );
    }

    // 7. Record workspace tombstone in suppression ledger
    const wsHash = crypto.createHash('sha256').update(`workspace:${workspaceId}`).digest('hex');
    await client.query(
      `SELECT app.record_deletion_tombstone('workspace', $1, $2, 'workspace_owner_deleted');`,
      [workspaceId, wsHash]
    );

    // 8. Purge workspace rows using Security Definer procedure
    await client.query('SELECT app.purge_owned_workspace($1, $2);', [workspaceId, userId]);

    return { deletionId, storagePaths };
  }

  /**
   * Delete single workspace using pool: executes transaction inside withUserContext,
   * commits, then attempts storage cleanup outside the transaction.
   */
  async deleteSingleWorkspaceWithPool(
    pool: Pool,
    userId: string,
    workspaceId: string,
    sessionToken: string,
    options: { password?: string; reauthTicket?: string; reason?: string },
    userEmail?: string
  ): Promise<RequestWorkspaceDeletionResponse> {
    const { deletionId, storagePaths } = await withUserContext(pool, userId, async (client) => {
      return this.executeWorkspaceDeletionTransaction(
        client,
        userId,
        workspaceId,
        sessionToken,
        options,
        userEmail
      );
    });

    const storageProvider = getDefaultStorageProvider();
    let allPurged = true;
    for (const p of storagePaths) {
      try {
        await storageProvider.deleteObject(PRIVATE_ASSETS_BUCKET, p);
      } catch {
        allPurged = false;
      }
    }

    if (allPurged) {
      await withUserContext(pool, userId, async (client) => {
        await client.query(
          `UPDATE app.workspace_deletions SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1;`,
          [deletionId]
        );
      });
    } else {
      await withUserContext(pool, userId, async (client) => {
        await client.query(
          `UPDATE app.workspace_deletions SET last_error = 'Storage blob purge in progress by background worker', updated_at = now() WHERE id = $1;`,
          [deletionId]
        );
      });
    }

    return {
      success: true,
      deletionId,
      workspaceId,
      status: allPurged ? 'completed' : 'processing',
      completedAt: allPurged ? new Date().toISOString() : undefined,
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
    const { deletionId, storagePaths } = await this.executeWorkspaceDeletionTransaction(
      client,
      userId,
      workspaceId,
      sessionToken,
      options,
      userEmail
    );

    const storageProvider = getDefaultStorageProvider();
    let allPurged = true;
    for (const p of storagePaths) {
      try {
        await storageProvider.deleteObject(PRIVATE_ASSETS_BUCKET, p);
      } catch {
        allPurged = false;
      }
    }

    if (allPurged) {
      await client.query(
        `UPDATE app.workspace_deletions SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1;`,
        [deletionId]
      );
    } else {
      await client.query(
        `UPDATE app.workspace_deletions SET last_error = 'Storage blob purge in progress by background worker', updated_at = now() WHERE id = $1;`,
        [deletionId]
      );
    }

    return {
      success: true,
      deletionId,
      workspaceId,
      status: allPurged ? 'completed' : 'processing',
      completedAt: allPurged ? new Date().toISOString() : undefined,
    };
  }

  /**
   * Submit public deletion request (enumeration-safe, abuse-throttled, verification required).
   */
  async submitPublicDeletionRequest(
    client: PoolClient | Pool,
    email: string,
    reason?: string
  ): Promise<PublicDeletionRequestResponse> {
    const normalized = email.toLowerCase().trim();
    const emailHash = crypto.createHash('sha256').update(normalized).digest('hex');

    // Abuse control: rate limit to max 3 requests per 15 minutes per email
    const rateCheck = await client.query<{ count: string }>(
      `SELECT count(*) as count FROM app.public_deletion_requests
       WHERE email_hash = $1 AND created_at > now() - interval '15 minutes';`,
      [emailHash]
    );

    if (parseInt(rateCheck.rows[0]?.count || '0', 10) >= 3) {
      return {
        success: true,
        message:
          'If an account is associated with this email address, a confirmation email with deletion instructions has been dispatched.',
        disclosure: DELETION_DISCLOSURE,
      };
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    const reqRes = await client.query<{ id: string }>(
      `INSERT INTO app.public_deletion_requests (
        email, email_hash, verification_token_hash, status, reason, created_at, expires_at
      )
      VALUES ($1, $2, $3, 'pending_verification', $4, now(), now() + interval '24 hours')
      RETURNING id;`,
      [normalized, emailHash, verificationTokenHash, reason || 'public_web_request']
    );

    const requestId = reqRes.rows[0]!.id;

    // Dispatch verification instructions through delivery adapter
    await this.emailDelivery.sendVerificationEmail(normalized, requestId, verificationToken);

    return {
      success: true,
      message:
        'If an account is associated with this email address, a confirmation email with deletion instructions has been dispatched.',
      disclosure: DELETION_DISCLOSURE,
    };
  }

  /**
   * Verify and execute a public deletion request.
   */
  async verifyPublicDeletionRequest(
    client: PoolClient | Pool,
    requestId: string,
    verificationToken: string
  ): Promise<VerifyPublicDeletionResponse> {
    const tokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');

    const res = await client.query<{
      id: string;
      email: string;
      email_hash: string;
      status: string;
      attempts: number;
      expires_at: Date;
    }>(
      `SELECT id, email, email_hash, status, attempts, expires_at
       FROM app.public_deletion_requests
       WHERE id = $1 AND verification_token_hash = $2;`,
      [requestId, tokenHash]
    );

    if (res.rows.length === 0) {
      await client.query(
        `UPDATE app.public_deletion_requests SET attempts = attempts + 1 WHERE id = $1;`,
        [requestId]
      );
      throw new ForbiddenError('Invalid verification token or request ID');
    }

    const row = res.rows[0]!;
    if (row.status === 'completed') {
      return {
        success: true,
        status: 'completed',
        message: 'Account deletion has already been processed and completed.',
      };
    }

    if (row.status === 'expired' || new Date(row.expires_at).getTime() < Date.now()) {
      await client.query(
        `UPDATE app.public_deletion_requests SET status = 'expired' WHERE id = $1;`,
        [requestId]
      );
      throw new ValidationError(
        'Verification token has expired; please submit a new deletion request'
      );
    }

    // Atomic status transition: pending_verification -> processing
    const updateRes = await client.query<{ id: string }>(
      `UPDATE app.public_deletion_requests
       SET status = 'processing', updated_at = now()
       WHERE id = $1 AND status = 'pending_verification'
       RETURNING id;`,
      [requestId]
    );

    if (updateRes.rows.length === 0 && row.status !== 'processing') {
      throw new ValidationError(
        'Concurrent public deletion verification in progress or already processed'
      );
    }

    // Resolve user ID associated with this email
    let targetUserId: string | null = null;
    const authenticator = getActiveAuthenticator();
    if (authenticator.getUserByEmail) {
      try {
        const u = await authenticator.getUserByEmail(row.email);
        if (u) {
          targetUserId = u.id;
        }
      } catch {
        // tolerate lookup failure
      }
    }

    if (!targetUserId) {
      try {
        const authUserRes = await client.query<{ id: string }>(
          `SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1;`,
          [row.email]
        );
        if (authUserRes.rows.length > 0) {
          targetUserId = authUserRes.rows[0]!.id;
        }
      } catch {
        // auth schema may not exist in pure isolated tests
      }
    }

    if (targetUserId) {
      // Record target_user_id on public deletion request to authorize privileged cleanup procedures
      await client.query(
        `UPDATE app.public_deletion_requests SET target_user_id = $1 WHERE id = $2;`,
        [targetUserId, requestId]
      );

      // Relational database purge + durable background jobs
      let storagePaths: string[];
      if ('connect' in client && typeof (client as Pool).connect === 'function') {
        storagePaths = await withUserContext(client as Pool, targetUserId, async (scopedClient) => {
          return this.executeDirectAccountPurge(
            scopedClient,
            targetUserId!,
            row.email,
            'public_web_verified_deletion',
            undefined,
            requestId
          );
        });
      } else {
        await client.query("SELECT set_config('app.current_user_id', $1, true);", [targetUserId]);
        storagePaths = await this.executeDirectAccountPurge(
          client,
          targetUserId,
          row.email,
          'public_web_verified_deletion',
          undefined,
          requestId
        );
      }

      // External provider and storage cleanup outside transaction
      const cleanup = await this.performExternalCleanup(targetUserId, storagePaths);

      if (cleanup.allSucceeded) {
        await client.query(
          `UPDATE app.public_deletion_requests SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1;`,
          [requestId]
        );
        return {
          success: true,
          status: 'completed',
          message:
            'Account ownership verified. All personal data and accounts associated with this email have been permanently deleted.',
        };
      }

      await client.query(
        `UPDATE app.public_deletion_requests SET last_error = $1, updated_at = now() WHERE id = $2;`,
        [cleanup.lastError || 'External provider cleanup pending', requestId]
      );

      return {
        success: true,
        status: 'processing',
        message:
          'Account ownership verified. Personal data erased; external provider cleanup is in progress.',
      };
    }

    // Email has no active user account: record suppression tombstone and mark completed
    const accountHash = crypto.createHash('sha256').update(`account:${row.email}`).digest('hex');
    await client.query(
      `SELECT app.record_deletion_tombstone('account', $1, $2, 'public_web_verified_deletion');`,
      [requestId, accountHash]
    );

    await client.query(
      `UPDATE app.public_deletion_requests SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1;`,
      [requestId]
    );

    return {
      success: true,
      status: 'completed',
      message:
        'Account ownership verified. No active account found for this email; cryptographic suppression tombstone has been recorded.',
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
    sessionToken?: string,
    expectedWorkspaceId?: string
  ): Promise<void> {
    if (options.reauthTicket) {
      const ticket = verifyReauthTicket(options.reauthTicket, {
        expectedUserId: userId,
        expectedPurpose,
        currentSessionToken: sessionToken,
        expectedWorkspaceId,
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
