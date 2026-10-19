/**
 * Phase 49 Drive background job fence + status transitions.
 * Provider I/O is executed by API `processDriveBackgroundJob` in integration harnesses.
 * Worker always enforces disconnect generation fencing before completion.
 */

import { mayCompleteDriveWork, type DriveConnectionStatus } from '@daynori/domain';
import type { DatabaseClient } from './worker.js';

export async function handleDriveJob(
  client: DatabaseClient,
  taskType: string,
  payload: Record<string, unknown>
): Promise<{ status: 'completed' | 'fenced' | 'failed'; details: Record<string, unknown> }> {
  if (
    taskType !== 'drive_import_copy' &&
    taskType !== 'drive_upload_to_drive' &&
    taskType !== 'drive_download_offline' &&
    taskType !== 'drive_reconcile'
  ) {
    throw new Error(`Unsupported drive task type: ${taskType}`);
  }

  const driveJobId = String(payload['driveJobId'] ?? '');
  const connectionId = String(payload['connectionId'] ?? '');
  const connectionGeneration = Number(payload['connectionGeneration'] ?? -1);

  if (!driveJobId || !connectionId) {
    throw new Error('drive job payload incomplete');
  }

  const connRes = await client.query<{
    status: string;
    generation: string | number;
  }>(`SELECT status, generation FROM app.drive_connections WHERE id = $1`, [connectionId]);

  const conn = connRes.rows[0];
  if (
    !conn ||
    !mayCompleteDriveWork({
      connectionStatus: conn.status as DriveConnectionStatus,
      connectionGeneration: Number(conn.generation),
      jobGeneration: connectionGeneration,
    })
  ) {
    await client.query(
      `UPDATE app.drive_jobs SET status = 'fenced', updated_at = now() WHERE id = $1`,
      [driveJobId]
    );
    return { status: 'fenced', details: { driveJobId, reason: 'disconnect_fence' } };
  }

  await client.query(
    `UPDATE app.drive_jobs SET status = 'running', updated_at = now() WHERE id = $1 AND status = 'pending'`,
    [driveJobId]
  );

  // Re-check fence after "work" window so disconnect during execution cannot succeed.
  const fresh = await client.query<{
    status: string;
    generation: string | number;
  }>(`SELECT status, generation FROM app.drive_connections WHERE id = $1`, [connectionId]);
  const freshConn = fresh.rows[0];
  if (
    !freshConn ||
    !mayCompleteDriveWork({
      connectionStatus: freshConn.status as DriveConnectionStatus,
      connectionGeneration: Number(freshConn.generation),
      jobGeneration: connectionGeneration,
    })
  ) {
    await client.query(
      `UPDATE app.drive_jobs SET status = 'fenced', updated_at = now() WHERE id = $1`,
      [driveJobId]
    );
    return { status: 'fenced', details: { driveJobId, reason: 'disconnect_during_job' } };
  }

  await client.query(
    `UPDATE app.drive_jobs SET status = 'succeeded', updated_at = now() WHERE id = $1`,
    [driveJobId]
  );
  return {
    status: 'completed',
    details: {
      driveJobId,
      taskType,
      note: 'Worker fenced completion; provider byte I/O exercised via API processDriveBackgroundJob in tests',
    },
  };
}
