/**
 * Phase 56 — Assistant ask + reviewable proposals.
 * Model output never executes; confirmation token is server-issued and opaque.
 */

import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  CreateTaskRequestSchema,
  UpdateTaskRequestSchema,
  CreateNoteRequestSchema,
  type AiAssistantOperation,
  type AiProposal,
} from '@daynori/contracts';
import { withUserContext } from '../../db/index.js';
import { createTask, updateTask } from '../tasks/service.js';
import { createNote } from '../notes/service.js';
import { AiServiceError, getAiConsentStatus, retrieveAuthorizedAnswer } from './service.js';

const PROPOSAL_TTL_MS = 15 * 60 * 1000;
const HISTORY_LIMIT = 50;

function mapProposal(row: {
  id: string;
  workspace_id: string;
  operation: string;
  payload: Record<string, unknown>;
  target_item_id: string | null;
  expected_revision: number | null;
  consent_generation: number;
  confirmation_token: string;
  status: string;
  execution_receipt: Record<string, unknown> | null;
  expires_at: Date;
  created_at: Date;
}): AiProposal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    operation: row.operation as AiAssistantOperation,
    payload: row.payload,
    targetItemId: row.target_item_id,
    expectedRevision: row.expected_revision === null ? null : Number(row.expected_revision),
    consentGeneration: Number(row.consent_generation),
    status: row.status as AiProposal['status'],
    expiresAt: row.expires_at.toISOString(),
    confirmationToken: row.confirmation_token,
    executionReceipt: row.execution_receipt,
    createdAt: row.created_at.toISOString(),
  };
}

function normalizeProposalPayload(
  operation: AiAssistantOperation,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (operation === 'create_personal_task') {
    const parsed = CreateTaskRequestSchema.parse({
      ...payload,
      // Stable id makes confirm retries idempotent after crash between write and receipt.
      id: typeof payload['id'] === 'string' ? payload['id'] : crypto.randomUUID(),
    }) as unknown as Record<string, unknown>;
    if (parsed['securityScope'] === 'vault') {
      throw new AiServiceError('Vault targets are forbidden', 403, 'AI_VAULT_FORBIDDEN');
    }
    return parsed;
  }
  if (operation === 'update_personal_task') {
    const parsed = UpdateTaskRequestSchema.parse(payload) as unknown as Record<string, unknown>;
    return parsed;
  }
  if (operation === 'create_personal_note') {
    const parsed = CreateNoteRequestSchema.parse({
      ...payload,
      id: typeof payload['id'] === 'string' ? payload['id'] : crypto.randomUUID(),
    }) as unknown as Record<string, unknown>;
    if (parsed['securityScope'] === 'vault') {
      throw new AiServiceError('Vault targets are forbidden', 403, 'AI_VAULT_FORBIDDEN');
    }
    return parsed;
  }
  throw new AiServiceError('Unsupported AI operation', 400, 'AI_OPERATION_UNSUPPORTED');
}

async function loadExistingCreateReceipt(
  client: PoolClient,
  kind: 'task' | 'note',
  workspaceId: string,
  itemId: string
): Promise<Record<string, unknown> | null> {
  const res = await client.query<{ id: string; revision: number }>(
    `SELECT id, revision FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = $3 AND deleted_at IS NULL`,
    [workspaceId, itemId, kind]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    kind,
    id: row.id,
    revision: Number(row.revision),
    recovered: true,
  };
}

export async function createAiProposal(
  client: PoolClient,
  input: {
    userId: string;
    workspaceId: string;
    operation: AiAssistantOperation;
    payload: Record<string, unknown>;
    targetItemId?: string;
    expectedRevision?: number;
  }
): Promise<AiProposal> {
  const consent = await getAiConsentStatus(client, input.userId);
  if (!consent.enabled) {
    throw new AiServiceError('AI consent required', 403, 'AI_CONSENT_REQUIRED');
  }
  const access = await client.query<{ kind: string; user_role: string | null }>(
    `SELECT kind, user_role FROM app.get_workspace_sync_access($1, $2)`,
    [input.workspaceId, input.userId]
  );
  if (!access.rows[0]?.user_role || access.rows[0].kind !== 'personal') {
    throw new AiServiceError('Proposals limited to personal workspace', 403, 'AI_SCOPE_FORBIDDEN');
  }

  // Reject unsupported classes up front.
  if (
    input.operation !== 'create_personal_task' &&
    input.operation !== 'update_personal_task' &&
    input.operation !== 'create_personal_note'
  ) {
    throw new AiServiceError('Unsupported AI operation', 400, 'AI_OPERATION_UNSUPPORTED');
  }

  const normalized = normalizeProposalPayload(input.operation, input.payload);
  if (input.operation === 'update_personal_task' && !input.targetItemId) {
    throw new AiServiceError('targetItemId required for update', 400, 'AI_PROPOSAL_INVALID');
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + PROPOSAL_TTL_MS);
  const res = await client.query<{
    id: string;
    workspace_id: string;
    operation: string;
    payload: Record<string, unknown>;
    target_item_id: string | null;
    expected_revision: number | null;
    consent_generation: number;
    confirmation_token: string;
    status: string;
    execution_receipt: Record<string, unknown> | null;
    expires_at: Date;
    created_at: Date;
  }>(
    `INSERT INTO app.ai_proposals (
       user_id, workspace_id, operation, payload, target_item_id, expected_revision,
       consent_generation, confirmation_token, status, expires_at
     ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,'pending',$9)
     RETURNING *`,
    [
      input.userId,
      input.workspaceId,
      input.operation,
      JSON.stringify(normalized),
      input.targetItemId ?? null,
      input.expectedRevision ?? null,
      consent.consentGeneration,
      token,
      expires.toISOString(),
    ]
  );
  return mapProposal(res.rows[0]!);
}

export async function askAssistant(
  pool: Pool,
  input: {
    userId: string;
    workspaceId: string;
    question: string;
    limit?: number;
    allowSuggestProposal?: boolean;
    signal?: AbortSignal;
  }
) {
  const retrieved = await retrieveAuthorizedAnswer(pool, {
    userId: input.userId,
    workspaceId: input.workspaceId,
    query: input.question,
    limit: input.limit,
    signal: input.signal,
  });

  return withUserContext(pool, input.userId, async (client) => {
    const consent = await getAiConsentStatus(client, input.userId);
    if (!consent.enabled) {
      throw new AiServiceError('AI consent required', 403, 'AI_CONSENT_REQUIRED');
    }

    const turn = await client.query<{ id: string }>(
      `INSERT INTO app.ai_assistant_turns (
         user_id, workspace_id, consent_generation, question, answer, abstained,
         citations, provider_mode
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       RETURNING id`,
      [
        input.userId,
        input.workspaceId,
        consent.consentGeneration,
        input.question,
        retrieved.answer,
        retrieved.abstained,
        JSON.stringify(retrieved.citations),
        retrieved.providerMode,
      ]
    );

    let suggestedProposal: AiProposal | null = null;
    // Typed propose heuristic is independent of answer grounding; still never executes.
    const proposeMatch = /^propose\s+task:\s*(.+)$/i.exec(input.question.trim());
    if (input.allowSuggestProposal && proposeMatch) {
      suggestedProposal = await createAiProposal(client, {
        userId: input.userId,
        workspaceId: input.workspaceId,
        operation: 'create_personal_task',
        payload: {
          title: proposeMatch[1]!.slice(0, 200),
          details: `Suggested from assistant turn ${turn.rows[0]!.id}`,
          priority: 'normal',
          status: 'todo',
        },
      });
    }

    return {
      turnId: turn.rows[0]!.id,
      answer: retrieved.answer,
      abstained: retrieved.abstained,
      citations: retrieved.citations,
      retrievedSourceCount: retrieved.retrievedSourceCount,
      providerMode: retrieved.providerMode,
      tokensReserved: retrieved.tokensReserved,
      tokensSettled: retrieved.tokensSettled,
      suggestedProposal,
      label: 'provisional-local-fake-or-gated' as const,
    };
  });
}

export async function listAssistantHistory(
  client: PoolClient,
  userId: string,
  workspaceId: string
) {
  await getAiConsentStatus(client, userId);
  const res = await client.query<{
    id: string;
    workspace_id: string;
    question: string;
    answer: string;
    abstained: boolean;
    citations: unknown;
    provider_mode: string;
    created_at: Date;
    expires_at: Date;
  }>(
    `SELECT id, workspace_id, question, answer, abstained, citations, provider_mode, created_at, expires_at
     FROM app.ai_assistant_turns
     WHERE user_id = $1 AND workspace_id = $2 AND expires_at > now()
       AND question <> ''
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, workspaceId, HISTORY_LIMIT]
  );
  return res.rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    question: r.question,
    answer: r.answer,
    abstained: r.abstained,
    citations: Array.isArray(r.citations) ? r.citations : [],
    providerMode: r.provider_mode,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
  }));
}

export async function saveAssistantDraft(
  client: PoolClient,
  input: { userId: string; workspaceId: string; draftQuestion: string }
) {
  const consent = await getAiConsentStatus(client, input.userId);
  // One durable draft row per user/workspace (account-isolated; purged on disable/delete).
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM app.ai_assistant_turns
     WHERE user_id = $1 AND workspace_id = $2 AND draft_question IS NOT NULL
       AND question = ''
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.userId, input.workspaceId]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE app.ai_assistant_turns
       SET draft_question = $2, consent_generation = $3, expires_at = now() + interval '30 days'
       WHERE id = $1`,
      [existing.rows[0].id, input.draftQuestion, consent.consentGeneration]
    );
    return;
  }
  await client.query(
    `INSERT INTO app.ai_assistant_turns (
       user_id, workspace_id, consent_generation, question, answer, abstained,
       citations, provider_mode, draft_question
     ) VALUES ($1,$2,$3,'','',true,'[]'::jsonb,'fake',$4)`,
    [input.userId, input.workspaceId, consent.consentGeneration, input.draftQuestion]
  );
}

export async function cancelAiProposal(
  client: PoolClient,
  input: { userId: string; proposalId: string }
): Promise<AiProposal> {
  const res = await client.query(
    `UPDATE app.ai_proposals
     SET status = 'cancelled', cancelled_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [input.proposalId, input.userId]
  );
  if (res.rows.length === 0) {
    const existing = await client.query(`SELECT * FROM app.ai_proposals WHERE id = $1 AND user_id = $2`, [
      input.proposalId,
      input.userId,
    ]);
    if (existing.rows.length === 0) {
      throw new AiServiceError('Proposal not found', 404, 'AI_PROPOSAL_NOT_FOUND');
    }
    return mapProposal(existing.rows[0]!);
  }
  return mapProposal(res.rows[0]!);
}

export async function confirmAiProposal(
  client: PoolClient,
  input: { userId: string; proposalId: string; confirmationToken: string }
): Promise<AiProposal> {
  const locked = await client.query(
    `SELECT * FROM app.ai_proposals WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [input.proposalId, input.userId]
  );
  const row = locked.rows[0];
  if (!row) {
    throw new AiServiceError('Proposal not found', 404, 'AI_PROPOSAL_NOT_FOUND');
  }

  // Safe retry: already confirmed with same token → return receipt.
  if (row.status === 'confirmed') {
    if (row.confirmation_token !== input.confirmationToken) {
      throw new AiServiceError('Confirmation token mismatch', 409, 'AI_CONFIRM_MISMATCH');
    }
    return mapProposal(row);
  }

  if (row.status !== 'pending') {
    throw new AiServiceError(`Proposal is ${row.status}`, 409, 'AI_PROPOSAL_NOT_PENDING');
  }
  if (row.confirmation_token !== input.confirmationToken) {
    throw new AiServiceError('Confirmation token mismatch', 409, 'AI_CONFIRM_MISMATCH');
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await client.query(
      `UPDATE app.ai_proposals SET status = 'expired' WHERE id = $1`,
      [input.proposalId]
    );
    throw new AiServiceError('Proposal expired', 409, 'AI_PROPOSAL_EXPIRED');
  }

  const consent = await getAiConsentStatus(client, input.userId);
  if (!consent.enabled || consent.consentGeneration !== Number(row.consent_generation)) {
    await client.query(
      `UPDATE app.ai_proposals SET status = 'cancelled', cancelled_at = now() WHERE id = $1`,
      [input.proposalId]
    );
    throw new AiServiceError('Consent changed — proposal invalidated', 403, 'AI_CONSENT_CHANGED');
  }

  const access = await client.query<{ kind: string; user_role: string | null }>(
    `SELECT kind, user_role FROM app.get_workspace_sync_access($1, $2)`,
    [row.workspace_id, input.userId]
  );
  if (!access.rows[0]?.user_role || access.rows[0].kind !== 'personal') {
    throw new AiServiceError('Workspace access revoked', 403, 'AI_SCOPE_FORBIDDEN');
  }

  // Domain item RLS (items_insert) requires current_workspace_id for the mutation.
  await client.query("SELECT set_config('app.current_workspace_id', $1, true);", [
    row.workspace_id,
  ]);

  // Re-normalize payload at confirm time (reject client-supplied args; confirm is token-only).
  const payload = normalizeProposalPayload(
    row.operation as AiAssistantOperation,
    row.payload as Record<string, unknown>
  );

  let receipt: Record<string, unknown>;
  await client.query('SAVEPOINT ai_proposal_exec');
  try {
    if (row.operation === 'create_personal_task') {
      const createId = String((payload as { id: string }).id);
      const recovered = await loadExistingCreateReceipt(
        client,
        'task',
        row.workspace_id,
        createId
      );
      if (recovered) {
        receipt = recovered;
      } else {
        const created = await createTask(
          client,
          row.workspace_id,
          input.userId,
          payload as never
        );
        receipt = { kind: 'task', id: created.id, revision: created.revision, seq: created.seq };
      }
    } else if (row.operation === 'update_personal_task') {
      if (!row.target_item_id) {
        throw new AiServiceError('Missing target', 400, 'AI_PROPOSAL_INVALID');
      }
      const updatePayload = {
        ...(payload as Record<string, unknown>),
        baseRevision:
          (payload as { baseRevision?: number }).baseRevision ??
          row.expected_revision ??
          undefined,
      };
      const updated = await updateTask(
        client,
        row.workspace_id,
        row.target_item_id,
        input.userId,
        updatePayload as never
      );
      receipt = { kind: 'task', id: updated.id, revision: updated.revision, seq: updated.seq };
    } else if (row.operation === 'create_personal_note') {
      const createId = String((payload as { id: string }).id);
      const recovered = await loadExistingCreateReceipt(
        client,
        'note',
        row.workspace_id,
        createId
      );
      if (recovered) {
        receipt = recovered;
      } else {
        const created = await createNote(
          client,
          row.workspace_id,
          input.userId,
          payload as never
        );
        receipt = { kind: 'note', id: created.id, revision: created.revision, seq: created.seq };
      }
    } else {
      throw new AiServiceError('Unsupported AI operation', 400, 'AI_OPERATION_UNSUPPORTED');
    }
    await client.query('RELEASE SAVEPOINT ai_proposal_exec');
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT ai_proposal_exec');
    await client.query(
      `UPDATE app.ai_proposals SET status = 'failed', execution_receipt = $2::jsonb WHERE id = $1`,
      [
        input.proposalId,
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          name: err instanceof Error ? err.name : 'error',
        }),
      ]
    );
    throw err;
  }

  const done = await client.query(
    `UPDATE app.ai_proposals
     SET status = 'confirmed', confirmed_at = now(), execution_receipt = $2::jsonb
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [input.proposalId, JSON.stringify(receipt)]
  );
  if (done.rows.length === 0) {
    // Concurrent confirm — return winner receipt.
    const again = await client.query(`SELECT * FROM app.ai_proposals WHERE id = $1`, [
      input.proposalId,
    ]);
    return mapProposal(again.rows[0]!);
  }
  return mapProposal(done.rows[0]!);
}

export async function purgeAssistantDataForUser(client: PoolClient, userId: string): Promise<void> {
  await client.query(`DELETE FROM app.ai_proposals WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM app.ai_assistant_turns WHERE user_id = $1`, [userId]);
}
