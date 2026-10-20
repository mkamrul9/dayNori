/**
 * Phase 55 repair — Connect AI index maintenance to organizer lifecycle events.
 * Safe no-op when AI local gate is off or consent is disabled.
 */

import type { PoolClient } from 'pg';
import { isAiLocallyEnabled } from '@daynori/domain';
import { enqueueAiIndexSource, invalidateAiIndexSource } from './jobExecutor.js';

export async function onPersonalItemUpsertedForAi(
  client: PoolClient,
  input: { userId: string; workspaceId: string; itemId: string; kind: string }
): Promise<void> {
  if (!isAiLocallyEnabled(process.env)) return;
  if (!['note', 'task', 'todo', 'journal', 'journal_entry'].includes(input.kind)) return;

  const access = await client.query<{ kind: string; user_role: string | null }>(
    `SELECT kind, user_role FROM app.get_workspace_sync_access($1, $2)`,
    [input.workspaceId, input.userId]
  );
  if (!access.rows[0]?.user_role || access.rows[0].kind !== 'personal') return;

  const consent = await client.query<{ enabled: boolean; consent_generation: number }>(
    `SELECT enabled, consent_generation FROM app.ai_consents WHERE user_id = $1`,
    [input.userId]
  );
  const row = consent.rows[0];
  if (!row?.enabled) return;

  await enqueueAiIndexSource(client, {
    userId: input.userId,
    workspaceId: input.workspaceId,
    itemId: input.itemId,
    consentGeneration: Number(row.consent_generation),
  });
}

export async function onPersonalItemInvalidatedForAi(
  client: PoolClient,
  input: { userId: string; workspaceId: string; itemId: string }
): Promise<void> {
  if (!isAiLocallyEnabled(process.env)) return;
  await invalidateAiIndexSource(client, input);
}
