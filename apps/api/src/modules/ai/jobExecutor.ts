/**
 * Durable AI index/purge jobs. Revalidates consent and eligibility before writing.
 * Stale jobs after disable/exclusion/deletion complete as fenced without recreating indexes.
 * consentGeneration is required — missing metadata fails closed.
 */

import type { PoolClient } from 'pg';
import { isAiLocallyEnabled } from '@daynori/domain';
import { indexPersonalSource, purgeAiDerived } from './service.js';

export type AiJobResult = {
  status: 'succeeded' | 'fenced' | 'failed';
  errorCode?: string;
  details?: Record<string, unknown>;
};

export async function executeAiBackgroundJob(
  client: PoolClient,
  payload: Record<string, unknown>
): Promise<AiJobResult> {
  if (!isAiLocallyEnabled(process.env)) {
    return { status: 'fenced', errorCode: 'AI_DISABLED', details: { reason: 'local_gate' } };
  }

  const task = String(payload['task'] ?? '');
  const userId = String(payload['userId'] ?? '');
  if (!userId) {
    return { status: 'failed', errorCode: 'AI_JOB_INVALID', details: { reason: 'missing_user' } };
  }

  await client.query("SELECT set_config('app.current_user_id', $1, true);", [userId]);

  if (task === 'ai_purge_derived') {
    const result = await purgeAiDerived(client, userId);
    return { status: 'succeeded', details: { deletedChunks: result.deletedChunks } };
  }

  if (task === 'ai_index_source') {
    const workspaceId = String(payload['workspaceId'] ?? '');
    const itemId = String(payload['itemId'] ?? '');
    const rawGen = payload['consentGeneration'];
    if (rawGen === undefined || rawGen === null || rawGen === '') {
      return {
        status: 'failed',
        errorCode: 'AI_JOB_GENERATION_REQUIRED',
        details: { reason: 'missing_consent_generation' },
      };
    }
    const expectedGeneration = Number(rawGen);
    if (!Number.isInteger(expectedGeneration) || expectedGeneration < 1) {
      return {
        status: 'failed',
        errorCode: 'AI_JOB_GENERATION_REQUIRED',
        details: { reason: 'invalid_consent_generation', value: rawGen },
      };
    }
    if (!workspaceId || !itemId) {
      return { status: 'failed', errorCode: 'AI_JOB_INVALID', details: { reason: 'missing_ids' } };
    }

    const consent = await client.query<{ enabled: boolean; consent_generation: number }>(
      `SELECT enabled, consent_generation FROM app.ai_consents WHERE user_id = $1`,
      [userId]
    );
    const row = consent.rows[0];
    if (!row?.enabled) {
      return { status: 'fenced', errorCode: 'AI_CONSENT_DISABLED', details: { reason: 'disabled' } };
    }
    if (Number(row.consent_generation) !== expectedGeneration) {
      return {
        status: 'fenced',
        errorCode: 'AI_CONSENT_GENERATION_STALE',
        details: {
          expected: expectedGeneration,
          actual: Number(row.consent_generation),
        },
      };
    }

    try {
      const indexed = await indexPersonalSource(client, { userId, workspaceId, itemId });
      if (!indexed.indexed) {
        return {
          status: 'fenced',
          errorCode: 'AI_SOURCE_INELIGIBLE',
          details: { reason: indexed.reason, chunkCount: indexed.chunkCount },
        };
      }
      // Final fence after write attempt — purge if consent flipped mid-job.
      const after = await client.query<{ enabled: boolean; consent_generation: number }>(
        `SELECT enabled, consent_generation FROM app.ai_consents WHERE user_id = $1`,
        [userId]
      );
      if (
        !after.rows[0]?.enabled ||
        Number(after.rows[0].consent_generation) !== expectedGeneration
      ) {
        await client.query(
          `DELETE FROM app.ai_index_chunks
           WHERE owner_user_id = $1 AND workspace_id = $2 AND source_item_id = $3`,
          [userId, workspaceId, itemId]
        );
        return {
          status: 'fenced',
          errorCode: 'AI_CONSENT_GENERATION_STALE',
          details: { reason: 'post_write_fence' },
        };
      }
      return { status: 'succeeded', details: { chunkCount: indexed.chunkCount } };
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : 'AI_INDEX_FAILED';
      if (code === 'AI_CONSENT_REQUIRED' || code === 'AI_SCOPE_FORBIDDEN' || code === 'AI_DISABLED') {
        return { status: 'fenced', errorCode: code };
      }
      return {
        status: 'failed',
        errorCode: code,
        details: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  return { status: 'failed', errorCode: 'AI_JOB_UNKNOWN', details: { task } };
}

export async function enqueueAiIndexSource(
  client: PoolClient,
  input: {
    userId: string;
    workspaceId: string;
    itemId: string;
    consentGeneration: number;
  }
): Promise<string> {
  if (!Number.isInteger(input.consentGeneration) || input.consentGeneration < 1) {
    throw new Error('AI_JOB_GENERATION_REQUIRED');
  }
  // Fence older pending jobs for the same source so stale workers cannot recreate purged indexes.
  await client.query(
    `UPDATE app.background_jobs
     SET status = 'failed', last_error = 'superseded by newer ai_index_source', updated_at = now()
     WHERE status IN ('pending', 'running')
       AND task_type = 'ai_index_source'
       AND payload->>'userId' = $1
       AND payload->>'itemId' = $2`,
    [input.userId, input.itemId]
  );
  const res = await client.query<{ id: string }>(
    `INSERT INTO app.background_jobs (task_type, payload, run_at, status, created_at, updated_at)
     VALUES ('ai_index_source', $1::jsonb, now(), 'pending', now(), now())
     RETURNING id`,
    [
      JSON.stringify({
        task: 'ai_index_source',
        userId: input.userId,
        workspaceId: input.workspaceId,
        itemId: input.itemId,
        consentGeneration: input.consentGeneration,
      }),
    ]
  );
  return res.rows[0]!.id;
}

export async function invalidateAiIndexSource(
  client: PoolClient,
  input: { userId: string; workspaceId: string; itemId: string }
): Promise<number> {
  await client.query(
    `UPDATE app.background_jobs
     SET status = 'failed', last_error = 'source invalidated', updated_at = now()
     WHERE status IN ('pending', 'running')
       AND task_type = 'ai_index_source'
       AND payload->>'userId' = $1
       AND payload->>'itemId' = $2`,
    [input.userId, input.itemId]
  );
  const res = await client.query(
    `DELETE FROM app.ai_index_chunks
     WHERE owner_user_id = $1 AND workspace_id = $2 AND source_item_id = $3`,
    [input.userId, input.workspaceId, input.itemId]
  );
  return res.rowCount ?? 0;
}
