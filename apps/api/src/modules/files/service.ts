import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  UPLOAD_CAPABILITY_EXPIRY_SECONDS,
  DOWNLOAD_CAPABILITY_EXPIRY_SECONDS,
  type FileQuarantineStatus,
  type UploadReservationStatus,
  type ReserveUploadRequest,
  type FileItem,
} from '@daynori/contracts';
import { getDefaultStorageProvider, StorageUnavailableError } from './storageAdapter.js';
import { inspectBinaryContent } from './inspector.js';
import { getDefaultMalwareScanner } from './scanner.js';
import {
  reserveQuota,
  finalizeQuota,
  releaseReservedExposure,
  releaseStoredBytes,
} from './quotaService.js';
import {
  insertChange,
  lockWorkspaceSyncState,
  updateWorkspaceSyncSeq,
  getMutationReceipt,
  insertMutationReceipt,
} from '../sync/repository.js';
import {
  NotFoundError as FileNotFoundError,
  NotFoundError as ReservationNotFoundError,
  FileNotReadyError,
  FileValidationError,
  ConflictError,
} from '../../plugins/errorHandler.js';

export const PRIVATE_ASSETS_BUCKET = 'private_assets';

export interface ReservationRecord {
  id: string;
  workspaceId: string;
  createdBy: string;
  folderId: string | null;
  fileName: string;
  declaredMimeType: string;
  declaredBytes: number;
  reservedExposureBytes: number;
  objectPath: string;
  fileId: string;
  status: UploadReservationStatus;
  providerUploadUrl: string;
  expiresAt: string;
  reconciled: boolean;
  createdAt: string;
  updatedAt: string;
}

export {
  FileNotFoundError,
  ReservationNotFoundError,
  FileNotReadyError,
  FileValidationError,
  ConflictError,
};

function computePayloadHash(payload: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload ?? {}))
    .digest('hex');
}

/**
 * 1. Reserve an upload capability with quota check and predictable isolation.
 */
export async function reserveFileUpload(
  client: PoolClient,
  params: {
    workspaceId: string;
    actorId: string;
    request: ReserveUploadRequest;
  }
): Promise<{
  reservationId: string;
  fileId: string;
  objectPath: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
  expiresInSeconds: number;
  maxByteLimit: number;
  reservedExposureBytes: number;
}> {
  const { workspaceId, actorId, request } = params;

  // Validate folder if specified
  if (request.folderId) {
    const folderRes = await client.query(
      `SELECT id FROM app.items WHERE id = $1 AND workspace_id = $2 AND kind = 'folder' AND deleted_at IS NULL`,
      [request.folderId, workspaceId]
    );
    if (folderRes.rowCount === 0) {
      throw new FileValidationError(
        `Target folder '${request.folderId}' does not exist in workspace`
      );
    }
  }

  // Prevent caller-supplied fileId from hijacking an existing item
  if (request.fileId) {
    const existing = await client.query<{ id: string; workspace_id: string; kind: string }>(
      `SELECT id, workspace_id, kind FROM app.items WHERE id = $1`,
      [request.fileId]
    );
    if (existing.rowCount && existing.rows[0]) {
      throw new ConflictError(`File ID '${request.fileId}' already exists in workspace`);
    }
  }

  const fileId = request.fileId ?? crypto.randomUUID();
  const versionId = '1';
  const randomHex = crypto.randomBytes(16).toString('hex');
  // Secure server-generated path: never derive from client names or emails!
  const objectPath = `${workspaceId}/${fileId}/${versionId}/${randomHex}`;

  // Reserve declared exposure bytes
  const reservedExposureBytes = request.declaredBytes;

  // Atomically check quota and reserve exposure
  await reserveQuota(client, workspaceId, reservedExposureBytes);

  // Check storage provider readiness
  const storageProvider = getDefaultStorageProvider();
  if (!storageProvider.isConfigured()) {
    throw new StorageUnavailableError('Storage provider is not configured or unavailable');
  }

  // Generate provider signed upload capability (2 hours validity)
  const { signedUrl, expiresInSeconds, method, headers } =
    await storageProvider.createSignedUploadUrl(PRIVATE_ASSETS_BUCKET, objectPath, {
      expiresInSeconds: UPLOAD_CAPABILITY_EXPIRY_SECONDS,
      upsert: false, // Strict: never permit overwrite
      contentType: request.declaredMimeType,
      maxByteLimit: request.declaredBytes,
    });

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  // Insert upload reservation record
  const insertRes = await client.query<{ id: string }>(
    `
    INSERT INTO app.upload_reservations (
      workspace_id,
      created_by,
      folder_id,
      file_name,
      declared_mime_type,
      declared_bytes,
      reserved_exposure_bytes,
      object_path,
      file_id,
      status,
      provider_upload_url,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reserved', $10, $11)
    RETURNING id
    `,
    [
      workspaceId,
      actorId,
      request.folderId ?? null,
      request.fileName,
      request.declaredMimeType,
      request.declaredBytes,
      reservedExposureBytes,
      objectPath,
      fileId,
      signedUrl,
      expiresAt,
    ]
  );

  const reservationId = insertRes.rows[0]!.id;

  return {
    reservationId,
    fileId,
    objectPath,
    uploadUrl: signedUrl,
    method: method ?? 'PUT',
    headers: headers ?? {
      'Content-Type': request.declaredMimeType,
    },
    expiresAt,
    expiresInSeconds,
    maxByteLimit: request.declaredBytes,
    reservedExposureBytes,
  };
}

/**
 * 2. Finalize an upload: idempotent verification, quarantine transitions, malware scan, and publication.
 */
export async function finalizeFileUpload(
  client: PoolClient,
  params: {
    workspaceId: string;
    actorId: string;
    reservationId: string;
    clientChecksum?: string;
    operationId?: string;
    deviceId?: string;
  }
): Promise<{
  fileId: string;
  status: FileQuarantineStatus;
  fileName: string;
  byteSize: number;
  detectedMimeType: string;
  sha256Checksum: string;
  rejectionReason?: string | null;
  verifiedAt?: string | null;
}> {
  const { workspaceId, actorId, reservationId, clientChecksum, operationId } = params;
  const deviceId = params.deviceId ?? 'files-client';
  const payloadHash = computePayloadHash({ reservationId, clientChecksum });

  // 1. Idempotency Receipt Check
  if (operationId) {
    const receipt = await getMutationReceipt(client, actorId, deviceId, operationId);
    if (receipt) {
      if (receipt.canonicalPayloadHash !== payloadHash) {
        throw new ConflictError(
          'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
        );
      }
      if (receipt.status === 'accepted' && receipt.resultPayload) {
        return receipt.resultPayload as {
          fileId: string;
          status: FileQuarantineStatus;
          fileName: string;
          byteSize: number;
          detectedMimeType: string;
          sha256Checksum: string;
          rejectionReason?: string | null;
          verifiedAt?: string | null;
        };
      }
    }
  }

  // 2. Fetch reservation
  const resRes = await client.query<ReservationRecord>(
    `
    SELECT
      id,
      workspace_id as "workspaceId",
      created_by as "createdBy",
      folder_id as "folderId",
      file_name as "fileName",
      declared_mime_type as "declaredMimeType",
      declared_bytes as "declaredBytes",
      reserved_exposure_bytes as "reservedExposureBytes",
      object_path as "objectPath",
      file_id as "fileId",
      status,
      provider_upload_url as "providerUploadUrl",
      expires_at as "expiresAt",
      reconciled,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM app.upload_reservations
    WHERE id = $1 AND workspace_id = $2
    FOR UPDATE
    `,
    [reservationId, workspaceId]
  );

  if (resRes.rowCount === 0) {
    throw new ReservationNotFoundError(`Reservation '${reservationId}' not found in workspace`);
  }

  const reservation = resRes.rows[0]!;

  // 3. Strict State Transition Enforcement
  if (reservation.status === 'verified' || reservation.status === 'finalized') {
    const existingFile = await client.query<{
      id: string;
      file_name: string;
      byte_size: string;
      detected_mime_type: string;
      sha256_checksum: string;
      quarantine_status: FileQuarantineStatus;
      rejection_reason: string | null;
      verified_at: string | Date | null;
    }>(
      `
      SELECT id, file_name, byte_size, detected_mime_type, sha256_checksum, quarantine_status, rejection_reason, verified_at
      FROM app.file_items
      WHERE id = $1 AND workspace_id = $2
      `,
      [reservation.fileId, workspaceId]
    );

    if (existingFile.rows[0]) {
      const f = existingFile.rows[0];
      return {
        fileId: f.id,
        status: f.quarantine_status,
        fileName: f.file_name,
        byteSize: Number(f.byte_size),
        detectedMimeType: f.detected_mime_type,
        sha256Checksum: f.sha256_checksum,
        rejectionReason: f.rejection_reason,
        verifiedAt: f.verified_at
          ? f.verified_at instanceof Date
            ? f.verified_at.toISOString()
            : new Date(f.verified_at).toISOString()
          : null,
      };
    }
  }

  if (reservation.status === 'cancelled') {
    throw new FileValidationError('Upload reservation was cancelled');
  }

  if (reservation.status === 'rejected') {
    throw new FileValidationError('Upload reservation was rejected and cannot be finalized');
  }

  const nowEpoch = Date.now();
  const expiresEpoch = new Date(reservation.expiresAt).getTime();
  if (reservation.status === 'expired' || expiresEpoch <= nowEpoch) {
    throw new FileValidationError('Upload reservation has expired');
  }

  if (reservation.status !== 'reserved' && reservation.status !== 'uploaded') {
    throw new FileValidationError(
      `Invalid reservation status for finalization: ${reservation.status}`
    );
  }

  // 4. Recheck target folder existence and authorization if folderId was set
  if (reservation.folderId) {
    const folderCheck = await client.query(
      `SELECT id FROM app.items WHERE id = $1 AND workspace_id = $2 AND kind = 'folder' AND deleted_at IS NULL`,
      [reservation.folderId, workspaceId]
    );
    if (folderCheck.rowCount === 0) {
      throw new FileValidationError(
        `Destination folder '${reservation.folderId}' no longer exists in workspace`
      );
    }
  }

  // 5. Retrieve stored binary from storage provider
  const storageProvider = getDefaultStorageProvider();
  if (!storageProvider.isConfigured()) {
    throw new StorageUnavailableError('Storage provider is not configured or unavailable');
  }

  const bytes = await storageProvider.getObject(PRIVATE_ASSETS_BUCKET, reservation.objectPath);

  if (!bytes || bytes.length === 0) {
    throw new FileValidationError(
      'Binary object was not received by storage provider. Please upload bytes before finalizing.'
    );
  }

  // 6. Content Inspection & Signature Verification
  const inspection = inspectBinaryContent(
    bytes,
    reservation.declaredMimeType,
    reservation.reservedExposureBytes
  );

  if (!inspection.isValid) {
    // Revoke capability, purge object, and mark rejected
    await storageProvider.revokeUploadCapability(reservation.objectPath).catch(() => {});
    await storageProvider
      .deleteObject(PRIVATE_ASSETS_BUCKET, reservation.objectPath)
      .catch(() => {});

    await client.query(
      `
      UPDATE app.upload_reservations
      SET status = 'rejected', reconciled = true, updated_at = now()
      WHERE id = $1
      `,
      [reservationId]
    );

    // Release exposure since object was purged and capability revoked
    await releaseReservedExposure(client, workspaceId, reservation.reservedExposureBytes);

    throw new FileValidationError(
      `File failed security verification: ${inspection.rejectionReason ?? 'Disallowed content'}`
    );
  }

  // Verify client checksum claim if provided (do not reject reservation so client can retry)
  if (clientChecksum && clientChecksum.toLowerCase() !== inspection.sha256Checksum.toLowerCase()) {
    throw new FileValidationError(
      `Integrity mismatch: declared checksum '${clientChecksum}' does not match computed checksum '${inspection.sha256Checksum}'`
    );
  }

  // 7. Fail-Closed Malware Scanning Policy
  const scanner = getDefaultMalwareScanner();
  const scanResult = await scanner.scanBytes(bytes, {
    fileName: reservation.fileName,
    detectedMime: inspection.detectedMimeType,
  });

  if (!scanResult.isClean) {
    await storageProvider.revokeUploadCapability(reservation.objectPath).catch(() => {});
    await storageProvider
      .deleteObject(PRIVATE_ASSETS_BUCKET, reservation.objectPath)
      .catch(() => {});

    await client.query(
      `
      UPDATE app.upload_reservations
      SET status = 'rejected', reconciled = true, updated_at = now()
      WHERE id = $1
      `,
      [reservationId]
    );

    await releaseReservedExposure(client, workspaceId, reservation.reservedExposureBytes);

    throw new FileValidationError(
      `File rejected by malware scanner: ${scanResult.threatName ?? 'Malicious payload detected'}`
    );
  }

  const nowIso = new Date().toISOString();

  // 8. Transition Quota from Reserved Exposure to Actual Stored Bytes
  await finalizeQuota(client, workspaceId, reservation.reservedExposureBytes, inspection.byteSize);

  // 9. Check if item exists (separate initial creation from version update)
  const existingItemRes = await client.query<{
    id: string;
    workspace_id: string;
    kind: string;
    revision: string;
  }>(`SELECT id, workspace_id, kind, revision FROM app.items WHERE id = $1 FOR UPDATE`, [
    reservation.fileId,
  ]);

  let versionStr = '1';
  let serverRevision = 1;

  if (existingItemRes.rows[0]) {
    const existing = existingItemRes.rows[0];
    if (existing.workspace_id !== workspaceId) {
      throw new ConflictError(`File ID '${reservation.fileId}' belongs to another workspace`);
    }
    if (existing.kind !== 'file') {
      throw new ConflictError(
        `Item ID '${reservation.fileId}' is already used for another entity kind`
      );
    }

    // Authorized revision update for existing file
    serverRevision = Number(existing.revision) + 1;

    const maxVerRes = await client.query<{ max_ver: string }>(
      `SELECT COALESCE(MAX(version::integer), 1) as max_ver FROM app.file_versions WHERE file_id = $1`,
      [reservation.fileId]
    );
    const nextVer = Number(maxVerRes.rows[0]?.max_ver ?? 1) + 1;
    versionStr = String(nextVer);

    await client.query(
      `UPDATE app.items SET updated_by = $1, revision = $2, updated_at = $3 WHERE id = $4 AND workspace_id = $5`,
      [actorId, serverRevision, nowIso, reservation.fileId, workspaceId]
    );

    await client.query(
      `
      UPDATE app.file_items SET
        file_name = $1,
        declared_mime_type = $2,
        detected_mime_type = $3,
        byte_size = $4,
        sha256_checksum = $5,
        object_path = $6,
        version = $7,
        quarantine_status = 'verified',
        updated_at = $8,
        verified_at = $8,
        scanner_engine = $9,
        scanned_bytes = $10,
        scanned_checksum = $11
      WHERE id = $12 AND workspace_id = $13
      `,
      [
        reservation.fileName,
        reservation.declaredMimeType,
        inspection.detectedMimeType,
        inspection.byteSize,
        inspection.sha256Checksum,
        reservation.objectPath,
        versionStr,
        nowIso,
        scanResult.scannerEngine,
        inspection.byteSize,
        inspection.sha256Checksum,
        reservation.fileId,
        workspaceId,
      ]
    );

    await client.query(
      `
      INSERT INTO app.file_versions (
        file_id,
        workspace_id,
        version,
        object_path,
        byte_size,
        sha256_checksum,
        detected_mime_type,
        created_by,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        reservation.fileId,
        workspaceId,
        versionStr,
        reservation.objectPath,
        inspection.byteSize,
        inspection.sha256Checksum,
        inspection.detectedMimeType,
        actorId,
        nowIso,
      ]
    );
  } else {
    // Brand-new initial creation: strict insert without ON CONFLICT hijacking
    await client.query(
      `
      INSERT INTO app.items (
        id,
        workspace_id,
        folder_id,
        kind,
        created_by,
        updated_by,
        display_order,
        revision,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'file', $4, $4, 0, 1, $5, $5)
      `,
      [reservation.fileId, workspaceId, reservation.folderId, actorId, nowIso]
    );

    await client.query(
      `
      INSERT INTO app.file_items (
        id,
        workspace_id,
        folder_id,
        file_name,
        declared_mime_type,
        detected_mime_type,
        byte_size,
        sha256_checksum,
        object_path,
        version,
        quarantine_status,
        created_by,
        created_at,
        updated_at,
        verified_at,
        scanner_engine,
        scanned_bytes,
        scanned_checksum
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '1', 'verified', $10, $11, $11, $11, $12, $13, $14)
      `,
      [
        reservation.fileId,
        workspaceId,
        reservation.folderId,
        reservation.fileName,
        reservation.declaredMimeType,
        inspection.detectedMimeType,
        inspection.byteSize,
        inspection.sha256Checksum,
        reservation.objectPath,
        actorId,
        nowIso,
        scanResult.scannerEngine,
        inspection.byteSize,
        inspection.sha256Checksum,
      ]
    );

    await client.query(
      `
      INSERT INTO app.file_versions (
        file_id,
        workspace_id,
        version,
        object_path,
        byte_size,
        sha256_checksum,
        detected_mime_type,
        created_by,
        created_at
      )
      VALUES ($1, $2, '1', $3, $4, $5, $6, $7, $8)
      `,
      [
        reservation.fileId,
        workspaceId,
        reservation.objectPath,
        inspection.byteSize,
        inspection.sha256Checksum,
        inspection.detectedMimeType,
        actorId,
        nowIso,
      ]
    );
  }

  // 10. Update reservation status to finalized
  await client.query(
    `
    UPDATE app.upload_reservations
    SET status = 'finalized', reconciled = true, updated_at = now()
    WHERE id = $1
    `,
    [reservationId]
  );

  // 11. Record complete canonical file projection in change feed outbox
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const outboxOperationId = operationId ?? crypto.randomUUID();

  const fileProjection = {
    id: reservation.fileId,
    workspaceId,
    folderId: reservation.folderId,
    fileName: reservation.fileName,
    declaredMimeType: reservation.declaredMimeType,
    detectedMimeType: inspection.detectedMimeType,
    byteSize: inspection.byteSize,
    sha256Checksum: inspection.sha256Checksum,
    version: versionStr,
    quarantineStatus: 'verified',
    rejectionReason: null,
    createdBy: actorId,
    createdAt: nowIso,
    updatedAt: nowIso,
    verifiedAt: nowIso,
  };

  await insertChange(client, {
    workspaceId,
    seq: syncState.nextChangeSeq,
    entityType: 'file',
    entityId: reservation.fileId,
    revision: serverRevision,
    isTombstone: false,
    operationId: outboxOperationId,
    changeData: fileProjection,
  });
  await updateWorkspaceSyncSeq(client, workspaceId, syncState.nextChangeSeq + 1);

  const resultPayload = {
    fileId: reservation.fileId,
    status: 'verified' as FileQuarantineStatus,
    fileName: reservation.fileName,
    byteSize: inspection.byteSize,
    detectedMimeType: inspection.detectedMimeType,
    sha256Checksum: inspection.sha256Checksum,
    verifiedAt: nowIso,
  };

  // 12. Record mutation receipt for durable idempotency
  if (operationId) {
    await insertMutationReceipt(client, {
      workspaceId,
      actorUserId: actorId,
      deviceId,
      operationId,
      command: 'files.finalize',
      entityType: 'file',
      entityId: reservation.fileId,
      schemaVersion: 1,
      baseRevision: 0,
      canonicalPayloadHash: payloadHash,
      status: 'accepted',
      acceptedRevision: serverRevision,
      appliedChangeSeq: null,
      resultPayload,
    });
  }

  return resultPayload;
}

/**
 * 3. Get upload reservation status.
 */
export async function getUploadReservationStatus(
  client: PoolClient,
  workspaceId: string,
  reservationId: string
): Promise<ReservationRecord> {
  const res = await client.query<{
    id: string;
    workspaceId: string;
    createdBy: string;
    folderId: string | null;
    fileName: string;
    declaredMimeType: string;
    declaredBytes: string | number;
    reservedExposureBytes: string | number;
    objectPath: string;
    fileId: string;
    status: UploadReservationStatus;
    providerUploadUrl: string;
    expiresAt: string | Date;
    reconciled: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
  }>(
    `
    SELECT
      id,
      workspace_id as "workspaceId",
      created_by as "createdBy",
      folder_id as "folderId",
      file_name as "fileName",
      declared_mime_type as "declaredMimeType",
      declared_bytes as "declaredBytes",
      reserved_exposure_bytes as "reservedExposureBytes",
      object_path as "objectPath",
      file_id as "fileId",
      status,
      provider_upload_url as "providerUploadUrl",
      expires_at as "expiresAt",
      reconciled,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM app.upload_reservations
    WHERE id = $1 AND workspace_id = $2
    `,
    [reservationId, workspaceId]
  );

  if (res.rowCount === 0) {
    throw new ReservationNotFoundError(`Reservation '${reservationId}' not found`);
  }

  const row = res.rows[0]!;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdBy: row.createdBy,
    folderId: row.folderId,
    fileName: row.fileName,
    declaredMimeType: row.declaredMimeType,
    declaredBytes: Number(row.declaredBytes),
    reservedExposureBytes: Number(row.reservedExposureBytes),
    objectPath: row.objectPath,
    fileId: row.fileId,
    status: row.status,
    providerUploadUrl: row.providerUploadUrl,
    expiresAt:
      row.expiresAt instanceof Date
        ? row.expiresAt.toISOString()
        : new Date(row.expiresAt).toISOString(),
    reconciled: row.reconciled,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : new Date(row.updatedAt).toISOString(),
  };
}

/**
 * 4. Cancel upload reservation.
 * Revokes upload capability and deletes any uploaded binary before reconciling exposure.
 */
export async function cancelUploadReservation(
  client: PoolClient,
  workspaceId: string,
  _actorId: string,
  reservationId: string
): Promise<{ reservationId: string; status: 'cancelled'; reconciled: boolean }> {
  const reservation = await getUploadReservationStatus(client, workspaceId, reservationId);

  if (reservation.status === 'finalized' || reservation.status === 'verified') {
    throw new FileValidationError('Cannot cancel an already finalized upload reservation');
  }

  const storageProvider = getDefaultStorageProvider();

  // 1. Explicitly revoke the capability so no late uploads can occur
  await storageProvider.revokeUploadCapability(reservation.objectPath).catch(() => {});

  // 2. Check if an object was uploaded
  const exists = await storageProvider
    .headObject(PRIVATE_ASSETS_BUCKET, reservation.objectPath)
    .catch(() => null);

  let reconciled = false;
  if (exists) {
    // Delete the stored binary before releasing exposure
    try {
      await storageProvider.deleteObject(PRIVATE_ASSETS_BUCKET, reservation.objectPath);
      await releaseReservedExposure(client, workspaceId, reservation.reservedExposureBytes);
      reconciled = true;
    } catch {
      // If storage delete failed, keep exposure accounted for until worker reconciles it!
      reconciled = false;
    }
  } else {
    // No object in storage and capability revoked -> safe to reconcile immediately
    await releaseReservedExposure(client, workspaceId, reservation.reservedExposureBytes);
    reconciled = true;
  }

  await client.query(
    `
    UPDATE app.upload_reservations
    SET status = 'cancelled', reconciled = $2, updated_at = now()
    WHERE id = $1
    `,
    [reservationId, reconciled]
  );

  return {
    reservationId,
    status: 'cancelled',
    reconciled,
  };
}

/**
 * 5. Issue short-lived authorized download capability (valid 300 seconds).
 * Strictly guards against unverified or quarantined files.
 */
export async function getFileDownloadCapability(
  client: PoolClient,
  workspaceId: string,
  fileId: string
): Promise<{
  fileId: string;
  downloadUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
}> {
  const file = await getFileItem(client, workspaceId, fileId);

  // Guard: ONLY verified files may be downloaded!
  if (file.quarantineStatus !== 'verified') {
    throw new FileNotReadyError(
      `File '${fileId}' has quarantine status '${file.quarantineStatus}' and cannot be downloaded`
    );
  }

  const storageProvider = getDefaultStorageProvider();
  if (!storageProvider.isConfigured()) {
    throw new StorageUnavailableError('Storage provider is not configured or unavailable');
  }

  const { signedUrl, expiresInSeconds } = await storageProvider.createSignedDownloadUrl(
    PRIVATE_ASSETS_BUCKET,
    file.object_path,
    {
      expiresInSeconds: DOWNLOAD_CAPABILITY_EXPIRY_SECONDS,
    }
  );

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  return {
    fileId,
    downloadUrl: signedUrl,
    expiresAt,
    expiresInSeconds,
    fileName: file.fileName,
    mimeType: file.detectedMimeType,
    byteSize: file.byteSize,
  };
}

/**
 * 6. Get file item metadata.
 */
export async function getFileItem(
  client: PoolClient,
  workspaceId: string,
  fileId: string
): Promise<FileItem & { object_path: string }> {
  const res = await client.query<{
    id: string;
    workspace_id: string;
    folder_id: string | null;
    file_name: string;
    declared_mime_type: string;
    detected_mime_type: string;
    byte_size: string;
    sha256_checksum: string;
    version: string;
    quarantine_status: FileQuarantineStatus;
    rejection_reason: string | null;
    created_by: string;
    created_at: string | Date;
    updated_at: string | Date;
    verified_at: string | Date | null;
    object_path: string;
  }>(
    `
    SELECT
      id,
      workspace_id,
      folder_id,
      file_name,
      declared_mime_type,
      detected_mime_type,
      byte_size,
      sha256_checksum,
      version,
      quarantine_status,
      rejection_reason,
      created_by,
      created_at,
      updated_at,
      verified_at,
      object_path
    FROM app.file_items
    WHERE id = $1 AND workspace_id = $2
    `,
    [fileId, workspaceId]
  );

  if (res.rowCount === 0) {
    throw new FileNotFoundError(`File '${fileId}' not found in workspace`);
  }

  const row = res.rows[0]!;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    folderId: row.folder_id,
    fileName: row.file_name,
    declaredMimeType: row.declared_mime_type,
    detectedMimeType: row.detected_mime_type,
    byteSize: Number(row.byte_size),
    sha256Checksum: row.sha256_checksum,
    version: row.version,
    quarantineStatus: row.quarantine_status,
    rejectionReason: row.rejection_reason,
    createdBy: row.created_by,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
    verifiedAt: row.verified_at
      ? row.verified_at instanceof Date
        ? row.verified_at.toISOString()
        : new Date(row.verified_at).toISOString()
      : null,
    object_path: row.object_path,
  };
}

/**
 * 7. Delete file item with durable intent.
 * Enqueues durable background deletion job so DB transaction rollback
 * cannot leave database records pointing to deleted storage bytes.
 */
export async function deleteFileItem(
  client: PoolClient,
  workspaceId: string,
  _actorId: string,
  fileId: string,
  operationId?: string
): Promise<void> {
  const file = await getFileItem(client, workspaceId, fileId);

  // 1. Release stored bytes
  await releaseStoredBytes(client, workspaceId, file.byteSize);

  // 2. Mark deleted in database
  await client.query(
    `UPDATE app.file_items SET quarantine_status = 'deleted', updated_at = now() WHERE id = $1 AND workspace_id = $2`,
    [fileId, workspaceId]
  );

  // 3. Delete from items (cascades to file_items, file_versions)
  await client.query(`DELETE FROM app.items WHERE id = $1 AND workspace_id = $2`, [
    fileId,
    workspaceId,
  ]);

  // 4. Enqueue durable background job for external storage object deletion
  await client.query(
    `
    INSERT INTO app.background_jobs (task_type, payload, status)
    VALUES ('file_deletion', $1, 'pending')
    `,
    [
      JSON.stringify({
        workspaceId,
        fileId,
        objectPath: file.object_path,
        byteSize: file.byteSize,
      }),
    ]
  );

  // 5. Record change feed outbox event
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  await insertChange(client, {
    workspaceId,
    seq: syncState.nextChangeSeq,
    entityType: 'file',
    entityId: fileId,
    revision: 2,
    isTombstone: true,
    operationId: operationId ?? crypto.randomUUID(),
    changeData: { id: fileId, workspaceId, quarantineStatus: 'deleted' },
  });
  await updateWorkspaceSyncSeq(client, workspaceId, syncState.nextChangeSeq + 1);

  // 6. Proactively attempt storage deletion (if it fails, the background job retries)
  const storageProvider = getDefaultStorageProvider();
  if (storageProvider.isConfigured()) {
    try {
      await storageProvider.deleteObject(PRIVATE_ASSETS_BUCKET, file.object_path);
    } catch {
      // Handled dually by background job
    }
  }
}

/**
 * 8. Reconcile expired reservations and release orphan quota.
 * Does not suppress storage deletion failures: preserves accounting and retry state
 * until deletion actually succeeds.
 */
export async function reconcileExpiredReservations(client: PoolClient): Promise<number> {
  const expiredRes = await client.query<{
    id: string;
    workspace_id: string;
    object_path: string;
    reserved_exposure_bytes: string;
  }>(
    `
    SELECT id, workspace_id, object_path, reserved_exposure_bytes
    FROM app.upload_reservations
    WHERE expires_at < now()
      AND reconciled = false
      AND status IN ('reserved', 'uploaded', 'cancelled', 'expired', 'rejected')
    LIMIT 100
    FOR UPDATE SKIP LOCKED
    `
  );

  let count = 0;
  const storageProvider = getDefaultStorageProvider();

  for (const row of expiredRes.rows) {
    const exposure = Number(row.reserved_exposure_bytes);

    let deleteSuccess = true;
    try {
      await storageProvider.deleteObject(PRIVATE_ASSETS_BUCKET, row.object_path);
    } catch {
      deleteSuccess = false;
    }

    if (deleteSuccess) {
      // Release reserved quota
      await releaseReservedExposure(client, row.workspace_id, exposure);

      // Mark reconciled
      await client.query(
        `
        UPDATE app.upload_reservations
        SET status = 'expired', reconciled = true, updated_at = now()
        WHERE id = $1
        `,
        [row.id]
      );

      count++;
    }
  }

  return count;
}
