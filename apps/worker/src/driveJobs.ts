/**
 * Phase 49 Drive background jobs — dispatches to the shared API job executor
 * so worker completion means real provider I/O + byte handling, not generation checks alone.
 *
 * The executor lives under apps/api; loaded via a runtime path string so the worker
 * TypeScript project does not pull the API compilation graph into rootDir.
 */

import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseClient } from './worker.js';

async function loadDriveExecutor(): Promise<{
  executeDriveBackgroundJob: (
    client: unknown,
    payload: Record<string, unknown>
  ) => Promise<{
    status: 'succeeded' | 'fenced' | 'failed' | 'cancelled';
    errorCode?: string;
    details?: Record<string, unknown>;
  }>;
}> {
  const here = dirname(fileURLToPath(import.meta.url));
  // Prefer compiled API output; fall back to tsx-friendly src path in tests.
  const candidates = [
    join(here, '../../api/dist/modules/drive/jobExecutor.js'),
    join(here, '../../api/src/modules/drive/jobExecutor.ts'),
  ];
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      const href = pathToFileURL(candidate).href;
      // Variable import prevents tsc from expanding the API project into worker rootDir.
      const mod = (await import(href)) as {
        executeDriveBackgroundJob: (
          client: unknown,
          payload: Record<string, unknown>
        ) => Promise<{
          status: 'succeeded' | 'fenced' | 'failed' | 'cancelled';
          errorCode?: string;
          details?: Record<string, unknown>;
        }>;
      };
      return mod;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Unable to load Drive job executor from apps/api');
}

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

  const { executeDriveBackgroundJob } = await loadDriveExecutor();

  const result = await executeDriveBackgroundJob(client, {
    driveJobId: String(payload['driveJobId'] ?? ''),
    connectionId: String(payload['connectionId'] ?? ''),
    workspaceId: String(payload['workspaceId'] ?? ''),
    accountId: String(payload['accountId'] ?? ''),
    linkedFileId: String(payload['linkedFileId'] ?? ''),
    connectionGeneration: Number(payload['connectionGeneration'] ?? -1),
    providerFileId: String(payload['providerFileId'] ?? ''),
    exportMimeType: (payload['exportMimeType'] as string | null) ?? null,
    folderId: (payload['folderId'] as string | null) ?? null,
    localFileItemId: (payload['localFileItemId'] as string | null) ?? null,
    idempotencyKey: String(payload['idempotencyKey'] ?? ''),
    kind: taskType.replace(/^drive_/, ''),
  });

  // Terminal drive_jobs states are already persisted; complete the background job
  // (do not infinite-retry permanent application failures).
  return {
    status: 'completed',
    details: {
      driveJobId: payload['driveJobId'],
      driveStatus: result.status,
      errorCode: result.errorCode,
      ...result.details,
    },
  };
}
