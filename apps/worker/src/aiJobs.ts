/**
 * Phase 55 AI background jobs — loads API executor (same pattern as Drive).
 */

import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseClient } from './worker.js';

async function loadAiExecutor(): Promise<{
  executeAiBackgroundJob: (
    client: unknown,
    payload: Record<string, unknown>
  ) => Promise<{
    status: 'succeeded' | 'fenced' | 'failed';
    errorCode?: string;
    details?: Record<string, unknown>;
  }>;
}> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../api/dist/modules/ai/jobExecutor.js'),
    join(here, '../../api/src/modules/ai/jobExecutor.ts'),
  ];
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      const href = pathToFileURL(candidate).href;
      const mod = (await import(href)) as {
        executeAiBackgroundJob: (
          client: unknown,
          payload: Record<string, unknown>
        ) => Promise<{
          status: 'succeeded' | 'fenced' | 'failed';
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
    : new Error('Unable to load AI job executor from apps/api');
}

export async function handleAiJob(
  client: DatabaseClient,
  taskType: string,
  payload: Record<string, unknown>
): Promise<{ status: 'completed' | 'fenced' | 'failed'; details: Record<string, unknown> }> {
  if (taskType !== 'ai_index_source' && taskType !== 'ai_purge_derived') {
    throw new Error(`Unsupported AI task type: ${taskType}`);
  }

  const { executeAiBackgroundJob } = await loadAiExecutor();
  const result = await executeAiBackgroundJob(client, {
    ...payload,
    task: payload['task'] ?? taskType,
  });

  if (result.status === 'succeeded') {
    return { status: 'completed', details: result.details ?? {} };
  }
  if (result.status === 'fenced') {
    return {
      status: 'fenced',
      details: { errorCode: result.errorCode, ...(result.details ?? {}) },
    };
  }
  return {
    status: 'failed',
    details: { errorCode: result.errorCode, ...(result.details ?? {}) },
  };
}
