/**
 * Shared Drive job executor used by the worker dispatcher and API helpers.
 * Successful import/upload requires completed provider I/O and persisted bytes — not generation checks alone.
 */

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  evaluateSelectedObjectSupport,
  isVaultDriveTarget,
  mayCompleteDriveWork,
  type DriveConnectionStatus,
} from '@daynori/domain';
import {
  PRIVATE_ASSETS_BUCKET,
  reserveFileUpload,
  finalizeFileUpload,
  FileValidationError,
} from '../files/service.js';
import { getDefaultStorageProvider } from '../files/storageAdapter.js';
import {
  DriveProviderUnavailableError,
  getDriveProvider,
  MAX_DRIVE_DOWNLOAD_BYTES,
} from './provider.js';
import {
  DriveServiceError,
  getAccessTokenForConnection,
  loadConnectionRow,
  type ConnectionRow,
} from './serviceInternals.js';

export interface DriveJobPayload {
  driveJobId: string;
  connectionId: string;
  workspaceId: string;
  accountId: string;
  linkedFileId: string;
  connectionGeneration: number;
  providerFileId: string;
  exportMimeType: string | null;
  folderId: string | null;
  localFileItemId: string | null;
  idempotencyKey: string;
  kind?: string;
}

export type DriveJobResult = {
  status: 'succeeded' | 'fenced' | 'failed' | 'cancelled';
  errorCode?: string;
  details?: Record<string, unknown>;
};

interface LinkedFileRow {
  id: string;
  workspace_id: string;
  connection_id: string;
  account_id: string;
  provider_file_id: string;
  display_name: string;
  mime_type: string;
  link_mode: string;
  local_file_item_id: string | null;
  availability: string;
}

interface DriveJobRow {
  id: string;
  workspace_id: string;
  connection_id: string;
  linked_file_id: string | null;
  kind: string;
  status: string;
  connection_generation: string | number;
  idempotency_key: string;
  lease_token: string | null;
  leased_until: Date | null;
  error_code: string | null;
}

async function requireMembership(
  client: PoolClient,
  workspaceId: string,
  role: 'viewer' | 'editor'
): Promise<void> {
  const res = await client.query<{ exists: boolean }>(
    `SELECT app.user_has_workspace_role($1, $2) as exists`,
    [workspaceId, role]
  );
  if (!res.rows[0]?.exists) {
    throw new DriveServiceError('Workspace membership required', 403, 'forbidden');
  }
}

/**
 * Atomically claim a pending (or expired-lease) drive_jobs row.
 * Returns null if another worker holds a valid lease or the job is terminal.
 */
async function claimDriveJob(
  client: PoolClient,
  driveJobId: string
): Promise<{ job: DriveJobRow; leaseToken: string } | null> {
  const leaseToken = cryptoRandomUuid();
  const res = await client.query<DriveJobRow>(
    `UPDATE app.drive_jobs
     SET status = 'running',
         lease_token = $2::uuid,
         leased_until = now() + interval '10 minutes',
         updated_at = now()
     WHERE id = $1
       AND (
         status = 'pending'
         OR (status = 'running' AND (leased_until IS NULL OR leased_until < now()))
       )
     RETURNING *`,
    [driveJobId, leaseToken]
  );
  const job = res.rows[0];
  if (!job) return null;
  return { job, leaseToken };
}

function cryptoRandomUuid(): string {
  return globalThis.crypto.randomUUID();
}

function fenceJob(client: PoolClient, driveJobId: string): Promise<void> {
  return client
    .query(`UPDATE app.drive_jobs SET status = 'fenced', updated_at = now() WHERE id = $1`, [
      driveJobId,
    ])
    .then(() => undefined);
}

function failJob(
  client: PoolClient,
  driveJobId: string,
  code: string,
  message: string
): Promise<void> {
  return client
    .query(
      `UPDATE app.drive_jobs
       SET status = 'failed', error_code = $2, error_message = $3,
           lease_token = NULL, leased_until = NULL, updated_at = now()
       WHERE id = $1`,
      [driveJobId, code, message.slice(0, 500)]
    )
    .then(() => undefined);
}

async function loadAndValidateBinding(
  client: PoolClient,
  payload: DriveJobPayload,
  job: DriveJobRow,
  conn: ConnectionRow
): Promise<LinkedFileRow> {
  if (job.workspace_id !== payload.workspaceId) {
    throw new DriveServiceError('Job workspace mismatch', 403, 'binding_mismatch');
  }
  if (job.connection_id !== payload.connectionId || conn.id !== payload.connectionId) {
    throw new DriveServiceError('Job connection mismatch', 403, 'binding_mismatch');
  }
  if (conn.account_id !== payload.accountId) {
    throw new DriveServiceError('Connection ownership mismatch', 403, 'connection_ownership');
  }
  if (Number(job.connection_generation) !== payload.connectionGeneration) {
    throw new DriveServiceError('Job generation mismatch', 409, 'generation_mismatch');
  }
  if (job.idempotency_key !== payload.idempotencyKey) {
    throw new DriveServiceError('Idempotency key mismatch', 403, 'binding_mismatch');
  }
  if (!job.linked_file_id || job.linked_file_id !== payload.linkedFileId) {
    throw new DriveServiceError('Linked file binding mismatch', 403, 'binding_mismatch');
  }

  const linkedRes = await client.query<LinkedFileRow>(
    `SELECT * FROM app.drive_linked_files WHERE id = $1 FOR UPDATE`,
    [payload.linkedFileId]
  );
  const linked = linkedRes.rows[0];
  if (!linked) {
    throw new DriveServiceError('Linked file missing', 404, 'linked_file_missing');
  }
  if (
    linked.workspace_id !== payload.workspaceId ||
    linked.connection_id !== payload.connectionId ||
    linked.account_id !== payload.accountId
  ) {
    throw new DriveServiceError('Linked file tenant mismatch', 403, 'binding_mismatch');
  }
  if (linked.provider_file_id !== payload.providerFileId) {
    throw new DriveServiceError(
      'Provider file ID does not match authorized selection',
      403,
      'selection_boundary'
    );
  }
  if (job.kind === 'upload_to_drive') {
    if (!payload.localFileItemId || linked.local_file_item_id !== payload.localFileItemId) {
      throw new DriveServiceError('Upload source file binding mismatch', 403, 'binding_mismatch');
    }
  }
  return linked;
}

async function ingestBytesThroughFileLifecycle(
  client: PoolClient,
  input: {
    workspaceId: string;
    accountId: string;
    fileName: string;
    mimeType: string;
    bytes: Buffer;
    folderId: string | null;
    operationId: string;
  }
): Promise<{ fileId: string; sha256: string; quarantineStatus: string }> {
  if (input.bytes.length === 0) {
    throw new DriveServiceError('Downloaded bytes empty', 400, 'empty_bytes');
  }
  if (input.bytes.length > MAX_DRIVE_DOWNLOAD_BYTES) {
    throw new DriveServiceError('Downloaded bytes exceed limit', 413, 'bytes_too_large');
  }

  try {
    const reservation = await reserveFileUpload(client, {
      workspaceId: input.workspaceId,
      actorId: input.accountId,
      request: {
        fileName: input.fileName.replace(/[/\\]/g, '_').slice(0, 255) || 'drive-import.bin',
        declaredMimeType: input.mimeType,
        declaredBytes: input.bytes.length,
        folderId: input.folderId,
      },
    });

    const storage = getDefaultStorageProvider();
    if (!storage.isConfigured()) {
      throw new DriveServiceError('Storage provider unavailable', 503, 'storage_unavailable');
    }
    await storage.putObject(PRIVATE_ASSETS_BUCKET, reservation.objectPath, input.bytes, {
      contentType: input.mimeType,
    });

    const finalized = await finalizeFileUpload(client, {
      workspaceId: input.workspaceId,
      actorId: input.accountId,
      reservationId: reservation.reservationId,
      clientChecksum: createHash('sha256').update(input.bytes).digest('hex'),
      operationId: input.operationId,
      deviceId: 'drive-job-executor',
    });

    if (finalized.status === 'rejected') {
      throw new DriveServiceError(
        finalized.rejectionReason ?? 'Import rejected by scanner/inspector',
        400,
        'quarantine_rejected'
      );
    }

    return {
      fileId: finalized.fileId,
      sha256: finalized.sha256Checksum,
      quarantineStatus: finalized.status,
    };
  } catch (err) {
    if (err instanceof DriveServiceError) throw err;
    const name = err instanceof Error ? err.name : '';
    const message = err instanceof Error ? err.message : String(err);
    if (
      err instanceof FileValidationError ||
      name === 'FileValidationError' ||
      /malware|scanner|rejected by/i.test(message)
    ) {
      throw new DriveServiceError(message, 400, 'quarantine_rejected');
    }
    throw err;
  }
}

async function loadVerifiedLocalFileBytes(
  client: PoolClient,
  workspaceId: string,
  fileItemId: string
): Promise<{ bytes: Buffer; fileName: string; mimeType: string }> {
  const item = await client.query<{ kind: string }>(
    `SELECT kind FROM app.items WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [fileItemId, workspaceId]
  );
  if (!item.rows[0]) {
    throw new DriveServiceError('Local file item not found', 404, 'local_file_missing');
  }
  if (isVaultDriveTarget(item.rows[0].kind)) {
    throw new DriveServiceError('Vault content cannot use Drive connector', 403, 'vault_excluded');
  }

  const file = await client.query<{
    file_name: string;
    detected_mime_type: string;
    object_path: string;
    quarantine_status: string;
    byte_size: string;
  }>(
    `SELECT file_name, detected_mime_type, object_path, quarantine_status, byte_size
     FROM app.file_items WHERE id = $1 AND workspace_id = $2`,
    [fileItemId, workspaceId]
  );
  const row = file.rows[0];
  if (!row) {
    throw new DriveServiceError('Local file metadata missing', 404, 'local_file_missing');
  }
  if (row.quarantine_status !== 'verified') {
    throw new DriveServiceError(
      `Local file not verified for upload (status=${row.quarantine_status})`,
      400,
      'local_file_not_verified'
    );
  }

  const storage = getDefaultStorageProvider();
  const bytes = await storage.getObject(PRIVATE_ASSETS_BUCKET, row.object_path);
  if (!bytes || bytes.length === 0) {
    throw new DriveServiceError('Local file bytes unavailable', 404, 'local_bytes_missing');
  }
  if (bytes.length !== Number(row.byte_size)) {
    throw new DriveServiceError('Local file size mismatch', 409, 'local_bytes_mismatch');
  }
  return { bytes, fileName: row.file_name, mimeType: row.detected_mime_type };
}

/**
 * Execute a Drive background job end-to-end. Called by the worker dispatcher.
 */
export async function executeDriveBackgroundJob(
  client: PoolClient,
  payload: DriveJobPayload
): Promise<DriveJobResult> {
  await requireMembership(client, payload.workspaceId, 'editor');

  const conn = await loadConnectionRow(client, payload.workspaceId, payload.accountId);
  if (
    !conn ||
    !mayCompleteDriveWork({
      connectionStatus: conn.status as DriveConnectionStatus,
      connectionGeneration: Number(conn.generation),
      jobGeneration: payload.connectionGeneration,
    })
  ) {
    await fenceJob(client, payload.driveJobId);
    return { status: 'fenced', errorCode: 'disconnect_fence' };
  }

  // Idempotent success if already succeeded for this job.
  const existing = await client.query<DriveJobRow>(
    `SELECT * FROM app.drive_jobs WHERE id = $1`,
    [payload.driveJobId]
  );
  const existingJob = existing.rows[0];
  if (!existingJob) {
    return { status: 'failed', errorCode: 'job_not_found' };
  }
  if (existingJob.status === 'succeeded') {
    return { status: 'succeeded', details: { alreadyCompleted: true } };
  }
  if (existingJob.status === 'cancelled' || existingJob.status === 'fenced') {
    return { status: existingJob.status as 'cancelled' | 'fenced' };
  }
  if (existingJob.status === 'failed') {
    return { status: 'failed', errorCode: existingJob.error_code ?? 'failed' };
  }

  const claimed = await claimDriveJob(client, payload.driveJobId);
  if (!claimed) {
    // Lost race / duplicate delivery / valid lease held elsewhere
    const again = await client.query<DriveJobRow>(
      `SELECT * FROM app.drive_jobs WHERE id = $1`,
      [payload.driveJobId]
    );
    const row = again.rows[0];
    if (row?.status === 'succeeded') return { status: 'succeeded', details: { duplicateDelivery: true } };
    if (row?.status === 'fenced' || row?.status === 'cancelled') {
      return { status: row.status as 'fenced' | 'cancelled' };
    }
    return { status: 'failed', errorCode: 'claim_lost' };
  }
  const { job: claimedJob, leaseToken } = claimed;

  try {
    const linked = await loadAndValidateBinding(client, payload, claimedJob, conn);
    const provider = getDriveProvider();
    const accessToken = await getAccessTokenForConnection(client, conn, provider);

    // Re-fence after token acquisition (disconnect during refresh).
    const afterToken = await loadConnectionRow(client, payload.workspaceId, payload.accountId);
    if (
      !afterToken ||
      !mayCompleteDriveWork({
        connectionStatus: afterToken.status as DriveConnectionStatus,
        connectionGeneration: Number(afterToken.generation),
        jobGeneration: payload.connectionGeneration,
      })
    ) {
      await fenceJob(client, payload.driveJobId);
      return { status: 'fenced', errorCode: 'disconnect_during_refresh' };
    }

    if (claimedJob.kind === 'import_copy' || claimedJob.kind === 'download_offline') {
      const meta = await provider.getFileMeta(accessToken, linked.provider_file_id);
      const support = evaluateSelectedObjectSupport({
        providerFileId: meta.id,
        mimeType: meta.mimeType,
        name: meta.name,
        isShortcut: meta.isShortcut,
        isSharedDrive: meta.isSharedDrive,
        md5Checksum: meta.md5Checksum,
        version: meta.version,
      });
      if (!support.supported) {
        throw new DriveServiceError(support.reason ?? 'unsupported', 400, 'unsupported_object');
      }
      if (meta.trashed) {
        await client.query(
          `UPDATE app.drive_linked_files SET availability = 'source_unavailable', updated_at = now() WHERE id = $1`,
          [linked.id]
        );
        throw new DriveServiceError('Source deleted externally', 410, 'source_unavailable');
      }

      const downloaded = await provider.downloadFile(accessToken, linked.provider_file_id, {
        exportMimeType: payload.exportMimeType,
      });

      const ingested = await ingestBytesThroughFileLifecycle(client, {
        workspaceId: payload.workspaceId,
        accountId: payload.accountId,
        fileName: meta.name || linked.display_name,
        mimeType: downloaded.mimeType,
        bytes: downloaded.bytes,
        folderId: payload.folderId,
        operationId: `drive-import:${payload.idempotencyKey}`,
      });

      // Server-side download alone never establishes offline_cached.
      const availability =
        claimedJob.kind === 'download_offline' ? 'pending_offline' : 'imported';

      await client.query(
        `UPDATE app.drive_linked_files SET
          display_name = $2,
          mime_type = $3,
          availability = $4,
          checksum = $5,
          provider_version = $6,
          local_file_item_id = $7,
          last_reconciled_at = now(),
          updated_at = now()
         WHERE id = $1`,
        [
          linked.id,
          meta.name,
          downloaded.mimeType,
          availability,
          ingested.sha256,
          meta.version,
          ingested.fileId,
        ]
      );
    } else if (claimedJob.kind === 'upload_to_drive') {
      if (!payload.localFileItemId) {
        throw new DriveServiceError('localFileItemId required for upload', 400, 'local_file_required');
      }

      await client.query(
        `INSERT INTO app.drive_upload_operations (
          workspace_id, connection_id, drive_job_id, idempotency_key, local_file_item_id, status
        ) VALUES ($1,$2,$3,$4,$5,'pending')
        ON CONFLICT (connection_id, idempotency_key) DO UPDATE SET updated_at = now()
        RETURNING id, provider_file_id, status`,
        [
          payload.workspaceId,
          payload.connectionId,
          payload.driveJobId,
          payload.idempotencyKey,
          payload.localFileItemId,
        ]
      );

      const prior = await client.query<{ provider_file_id: string | null; status: string }>(
        `SELECT provider_file_id, status FROM app.drive_upload_operations
         WHERE connection_id = $1 AND idempotency_key = $2`,
        [payload.connectionId, payload.idempotencyKey]
      );
      if (prior.rows[0]?.status === 'succeeded' && prior.rows[0].provider_file_id) {
        await client.query(
          `UPDATE app.drive_linked_files SET
            provider_file_id = $2, provenance = 'upload', availability = 'linked',
            last_reconciled_at = now(), updated_at = now()
           WHERE id = $1`,
          [linked.id, prior.rows[0].provider_file_id]
        );
      } else {
        const local = await loadVerifiedLocalFileBytes(
          client,
          payload.workspaceId,
          payload.localFileItemId
        );

        let meta;
        try {
          meta = await provider.uploadAppFile(accessToken, {
            name: local.fileName,
            mimeType: local.mimeType,
            bytes: local.bytes,
            idempotencyKey: payload.idempotencyKey,
          });
        } catch (err) {
          // Lost/uncertain response: mark uncertain; do not blindly re-create without reconciliation.
          if (err instanceof DriveProviderUnavailableError && err.code.startsWith('http_5')) {
            await client.query(
              `UPDATE app.drive_upload_operations SET status = 'uncertain', last_error_code = $2, updated_at = now()
               WHERE connection_id = $1 AND idempotency_key = $3`,
              [payload.connectionId, err.code, payload.idempotencyKey]
            );
            throw new DriveServiceError(
              'Upload outcome uncertain; reconcile before retrying',
              409,
              'upload_uncertain'
            );
          }
          throw err;
        }

        await client.query(
          `UPDATE app.drive_upload_operations SET
            status = 'succeeded', provider_file_id = $2, updated_at = now()
           WHERE connection_id = $1 AND idempotency_key = $3`,
          [payload.connectionId, meta.id, payload.idempotencyKey]
        );
        await client.query(
          `UPDATE app.drive_linked_files SET
            provider_file_id = $2,
            display_name = $3,
            mime_type = $4,
            provenance = 'upload',
            checksum = $5,
            provider_version = $6,
            availability = 'linked',
            last_reconciled_at = now(),
            updated_at = now()
           WHERE id = $1`,
          [linked.id, meta.id, meta.name, meta.mimeType, meta.md5Checksum, meta.version]
        );
      }
    } else {
      throw new DriveServiceError(
        `Unsupported drive job kind: ${claimedJob.kind}`,
        400,
        'unsupported_kind'
      );
    }

    const fresh = await loadConnectionRow(client, payload.workspaceId, payload.accountId);
    if (
      !fresh ||
      !mayCompleteDriveWork({
        connectionStatus: fresh.status as DriveConnectionStatus,
        connectionGeneration: Number(fresh.generation),
        jobGeneration: payload.connectionGeneration,
      })
    ) {
      await fenceJob(client, payload.driveJobId);
      return { status: 'fenced', errorCode: 'disconnect_before_success' };
    }

    const done = await client.query(
      `UPDATE app.drive_jobs
       SET status = 'succeeded', lease_token = NULL, leased_until = NULL, updated_at = now()
       WHERE id = $1 AND status = 'running' AND lease_token = $2::uuid
       RETURNING id`,
      [payload.driveJobId, leaseToken]
    );
    if ((done.rowCount ?? 0) === 0) {
      return { status: 'failed', errorCode: 'lease_lost' };
    }
    return { status: 'succeeded' };
  } catch (err) {
    const code =
      err instanceof DriveServiceError
        ? err.code
        : err instanceof DriveProviderUnavailableError
          ? err.code
          : 'drive_job_failed';
    const message = err instanceof Error ? err.message : 'drive_job_failed';

    if (code === 'permission_denied') {
      await client.query(
        `UPDATE app.drive_linked_files SET availability = 'permission_lost', updated_at = now() WHERE id = $1`,
        [payload.linkedFileId]
      );
    }
    if (code === 'invalid_grant') {
      // Do not resurrect; mark connection revoked without waiting on external revoke.
      await client.query(
        `UPDATE app.drive_connections SET
          status = 'revoked', generation = generation + 1,
          refresh_token_ciphertext = NULL, refresh_token_key_version = NULL,
          disconnected_at = now(), provider_revoke_status = 'not_attempted', updated_at = now()
         WHERE id = $1`,
        [payload.connectionId]
      );
    }

    await failJob(client, payload.driveJobId, code, message);
    return { status: 'failed', errorCode: code, details: { message: message.slice(0, 200) } };
  }
}

/** Alias kept for existing API test imports. */
export async function processDriveBackgroundJob(
  client: PoolClient,
  payload: DriveJobPayload
): Promise<DriveJobResult> {
  return executeDriveBackgroundJob(client, payload);
}
