import type { PoolClient } from 'pg';
import { MAX_CONCURRENT_RESERVATIONS } from '@daynori/contracts';
import {
  QuotaExceededError,
  TooManyConcurrentReservationsError,
} from '../../plugins/errorHandler.js';

export interface StorageUsage {
  workspaceId: string;
  storedBytes: number;
  reservedBytes: number;
  totalCommittedBytes: number;
  maxStorageBytes: number;
  availableBytes: number;
  activeReservationsCount: number;
}

/**
 * Retrieves the current storage usage and quota limits for a workspace.
 */
export async function getStorageUsage(
  client: PoolClient,
  workspaceId: string
): Promise<StorageUsage> {
  // Ensure workspace_storage_usage row exists
  const usageRes = await client.query<{
    stored_bytes: string;
    reserved_bytes: string;
    max_storage_bytes: string;
  }>(
    `
    INSERT INTO app.workspace_storage_usage (workspace_id)
    VALUES ($1)
    ON CONFLICT (workspace_id) DO UPDATE SET updated_at = now()
    RETURNING stored_bytes, reserved_bytes, max_storage_bytes
    `,
    [workspaceId]
  );

  const row = usageRes.rows[0];
  const storedBytes = Number(row?.stored_bytes ?? 0);
  const reservedBytes = Number(row?.reserved_bytes ?? 0);
  const maxStorageBytes = Number(row?.max_storage_bytes ?? 104857600);

  // Count outstanding active reservations
  const countRes = await client.query<{ count: string }>(
    `
    SELECT COUNT(*) as count
    FROM app.upload_reservations
    WHERE workspace_id = $1
      AND status IN ('reserved', 'uploaded', 'quarantined')
      AND expires_at > now()
      AND reconciled = false
    `,
    [workspaceId]
  );
  const activeCount = Number(countRes.rows[0]?.count ?? 0);

  const totalCommitted = storedBytes + reservedBytes;
  const availableBytes = Math.max(0, maxStorageBytes - totalCommitted);

  return {
    workspaceId,
    storedBytes,
    reservedBytes,
    totalCommittedBytes: totalCommitted,
    maxStorageBytes,
    availableBytes,
    activeReservationsCount: activeCount,
  };
}

/**
 * Atomically checks quota and reserves upload exposure bytes before issuing capabilities.
 */
export async function reserveQuota(
  client: PoolClient,
  workspaceId: string,
  reservedExposureBytes: number
): Promise<StorageUsage> {
  // 1. Lock workspace storage usage row for atomic update
  const lockRes = await client.query<{
    stored_bytes: string;
    reserved_bytes: string;
    max_storage_bytes: string;
  }>(
    `
    INSERT INTO app.workspace_storage_usage (workspace_id)
    VALUES ($1)
    ON CONFLICT (workspace_id) DO UPDATE SET updated_at = now()
    RETURNING stored_bytes, reserved_bytes, max_storage_bytes
    `,
    [workspaceId]
  );

  const usageRow = lockRes.rows[0];
  const stored = Number(usageRow?.stored_bytes ?? 0);
  const reserved = Number(usageRow?.reserved_bytes ?? 0);
  const maxBytes = Number(usageRow?.max_storage_bytes ?? 104857600);

  // 2. Bound concurrent reservations
  const countRes = await client.query<{ count: string }>(
    `
    SELECT COUNT(*) as count
    FROM app.upload_reservations
    WHERE workspace_id = $1
      AND status IN ('reserved', 'uploaded', 'quarantined')
      AND expires_at > now()
      AND reconciled = false
    `,
    [workspaceId]
  );
  const activeReservations = Number(countRes.rows[0]?.count ?? 0);

  if (activeReservations >= MAX_CONCURRENT_RESERVATIONS) {
    throw new TooManyConcurrentReservationsError(
      `Workspace has reached the limit of ${MAX_CONCURRENT_RESERVATIONS} concurrent active upload reservations. Please finalize or wait for existing uploads to complete.`
    );
  }

  // 3. Check quota capacity
  if (stored + reserved + reservedExposureBytes > maxBytes) {
    throw new QuotaExceededError(
      `Insufficient storage quota: cannot reserve ${reservedExposureBytes} bytes. Current usage: ${stored} stored + ${reserved} reserved of ${maxBytes} allowed bytes.`
    );
  }

  // 4. Atomically commit reservation increment
  const updateRes = await client.query<{
    stored_bytes: string;
    reserved_bytes: string;
    max_storage_bytes: string;
  }>(
    `
    UPDATE app.workspace_storage_usage
    SET reserved_bytes = reserved_bytes + $2,
        updated_at = now()
    WHERE workspace_id = $1
    RETURNING stored_bytes, reserved_bytes, max_storage_bytes
    `,
    [workspaceId, reservedExposureBytes]
  );

  const updated = updateRes.rows[0]!;
  const newStored = Number(updated.stored_bytes);
  const newReserved = Number(updated.reserved_bytes);
  const newMax = Number(updated.max_storage_bytes);

  return {
    workspaceId,
    storedBytes: newStored,
    reservedBytes: newReserved,
    totalCommittedBytes: newStored + newReserved,
    maxStorageBytes: newMax,
    availableBytes: Math.max(0, newMax - (newStored + newReserved)),
    activeReservationsCount: activeReservations + 1,
  };
}

/**
 * Atomically transitions reservation exposure into stored bytes upon verified finalization.
 */
export async function finalizeQuota(
  client: PoolClient,
  workspaceId: string,
  reservedExposureBytes: number,
  actualStoredBytes: number
): Promise<void> {
  await client.query(
    `
    UPDATE app.workspace_storage_usage
    SET reserved_bytes = GREATEST(0, reserved_bytes - $2),
        stored_bytes = stored_bytes + $3,
        updated_at = now()
    WHERE workspace_id = $1
    `,
    [workspaceId, reservedExposureBytes, actualStoredBytes]
  );
}

/**
 * Releases reserved exposure bytes when a reservation is verified to not have stored any bytes.
 */
export async function releaseReservedExposure(
  client: PoolClient,
  workspaceId: string,
  reservedExposureBytes: number
): Promise<void> {
  await client.query(
    `
    UPDATE app.workspace_storage_usage
    SET reserved_bytes = GREATEST(0, reserved_bytes - $2),
        updated_at = now()
    WHERE workspace_id = $1
    `,
    [workspaceId, reservedExposureBytes]
  );
}

/**
 * Releases stored bytes upon file deletion.
 */
export async function releaseStoredBytes(
  client: PoolClient,
  workspaceId: string,
  storedBytes: number
): Promise<void> {
  await client.query(
    `
    UPDATE app.workspace_storage_usage
    SET stored_bytes = GREATEST(0, stored_bytes - $2),
        updated_at = now()
    WHERE workspace_id = $1
    `,
    [workspaceId, storedBytes]
  );
}
