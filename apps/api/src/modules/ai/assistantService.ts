/**
 * Phase 56 — Assistant ask + reviewable proposals (repaired).
 * Model output never executes; confirmation token is server-issued and opaque.
 * Create recovery binds to proposal operation_id + request_hash, not bare item existence.
 */

import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  CreateTaskRequestSchema,
  UpdateTaskRequestSchema,
  CreateNoteRequestSchema,
  CreateJournalEntryRequestSchema,
  type CreateJournalEntryRequest,
  type AiAssistantOperation,
  type AiCitation,
  type AiProposal,
  type AiProposalReviewSummary,
} from '@daynori/contracts';
import {
  findHelpArticle,
  detectJournalDateAmbiguity,
  getOrganizerDeepLink,
  sanitizeOrganizerText,
} from '@daynori/domain';
import { withUserContext, withTenantContext } from '../../db/index.js';
import { createTask, updateTask, getTask } from '../tasks/service.js';
import { createNote, getNote } from '../notes/service.js';
import { createJournalEntry } from '../journal/service.js';
import {
  getMutationReceipt,
  insertMutationReceipt,
} from '../sync/repository.js';
import { AiServiceError, getAiConsentStatus, retrieveAuthorizedAnswer } from './service.js';
import { resolveAiProvider } from './provider.js';

const PROPOSAL_TTL_MS = 15 * 60 * 1000;
const HISTORY_LIMIT = 50;
const AI_DEVICE_ID = 'ai-assistant-proposal';

export type ConfirmAiProposalResult =
  | { outcome: 'ok'; proposal: AiProposal }
  | { outcome: 'error'; proposal: AiProposal; error: AiServiceError };

type ProposalRow = {
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
  operation_id: string;
  request_hash: string;
  review_summary: Record<string, unknown> | null;
};

function hashRequest(parts: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function mapReviewSummary(raw: Record<string, unknown> | null | undefined): AiProposalReviewSummary {
  if (
    raw &&
    typeof raw['headline'] === 'string' &&
    typeof raw['targetLabel'] === 'string' &&
    typeof raw['after'] === 'string'
  ) {
    return {
      headline: raw['headline'],
      targetLabel: raw['targetLabel'],
      before: typeof raw['before'] === 'string' ? raw['before'] : null,
      after: raw['after'],
      destination: typeof raw['destination'] === 'string' ? raw['destination'] : undefined,
      date: typeof raw['date'] === 'string' ? raw['date'] : undefined,
      timezone: typeof raw['timezone'] === 'string' ? raw['timezone'] : undefined,
      source: typeof raw['source'] === 'string' ? raw['source'] : undefined,
    };
  }
  return {
    headline: 'Proposed organizer change',
    targetLabel: 'Item',
    before: null,
    after: 'See details in the review card.',
  };
}

function mapProposal(row: ProposalRow): AiProposal {
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
    reviewSummary: mapReviewSummary(row.review_summary),
    createdAt: row.created_at.toISOString(),
  };
}

function normalizeProposalPayload(
  operation: AiAssistantOperation,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (operation === 'create_personal_task') {
    const raw = { ...payload };
    if (typeof raw['dueDate'] === 'string' && !raw['deadline']) {
      raw['deadline'] = { type: 'date', date: raw['dueDate'] };
      delete raw['dueDate'];
    }
    const parsed = CreateTaskRequestSchema.parse({
      ...raw,
      id: typeof raw['id'] === 'string' ? raw['id'] : crypto.randomUUID(),
    }) as unknown as Record<string, unknown>;
    if (parsed['securityScope'] === 'vault') {
      throw new AiServiceError('Vault targets are forbidden', 403, 'AI_VAULT_FORBIDDEN');
    }
    return parsed;
  }
  if (operation === 'update_personal_task') {
    const raw = { ...payload };
    if (typeof raw['dueDate'] === 'string' && !raw['deadline']) {
      raw['deadline'] = { type: 'date', date: raw['dueDate'] };
      delete raw['dueDate'];
    }
    return UpdateTaskRequestSchema.parse(raw) as unknown as Record<string, unknown>;
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
  if (operation === 'create_personal_journal_entry') {
    const parsed = CreateJournalEntryRequestSchema.parse({
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

async function assertPersonalEditorAccess(
  client: PoolClient,
  workspaceId: string,
  userId: string
): Promise<void> {
  const access = await client.query<{ kind: string; user_role: string | null }>(
    `SELECT kind, user_role FROM app.get_workspace_sync_access($1, $2)`,
    [workspaceId, userId]
  );
  if (!access.rows[0]?.user_role || access.rows[0].kind !== 'personal') {
    throw new AiServiceError('Proposals limited to personal workspace', 403, 'AI_SCOPE_FORBIDDEN');
  }
}

async function validateUpdateTarget(
  client: PoolClient,
  input: {
    workspaceId: string;
    targetItemId: string;
    expectedRevision: number;
  }
): Promise<{ title: string; revision: number; beforeLabel: string }> {
  const item = await client.query<{
    id: string;
    kind: string;
    security_scope: string;
    revision: number;
    deleted_at: Date | null;
  }>(
    `SELECT id, kind, security_scope, revision, deleted_at
     FROM app.items
     WHERE workspace_id = $1 AND id = $2`,
    [input.workspaceId, input.targetItemId]
  );
  const row = item.rows[0];
  if (!row || row.deleted_at) {
    throw new AiServiceError('Update target not found', 404, 'AI_TARGET_NOT_FOUND');
  }
  if (row.kind !== 'task') {
    throw new AiServiceError('Update target must be a task', 400, 'AI_TARGET_KIND_INVALID');
  }
  if (row.security_scope === 'vault') {
    throw new AiServiceError('Vault targets are forbidden', 403, 'AI_VAULT_FORBIDDEN');
  }
  const rev = Number(row.revision);
  if (rev !== input.expectedRevision) {
    throw new AiServiceError(
      `Expected revision ${input.expectedRevision} does not match current ${rev}`,
      409,
      'AI_REVISION_CONFLICT'
    );
  }
  const task = await getTask(client, input.workspaceId, input.targetItemId);
  return {
    title: task.title,
    revision: rev,
    beforeLabel: `Task “${task.title}” (revision ${rev})`,
  };
}

function buildReviewSummary(
  operation: AiAssistantOperation,
  payload: Record<string, unknown>,
  target: { title?: string; beforeLabel?: string } | null
): AiProposalReviewSummary {
  if (operation === 'create_personal_task') {
    const title = String(payload['title'] ?? 'Untitled task');
    const deadline = payload['deadline'] as
      | { type: string; date?: string; timestamp?: string; timezone?: string }
      | undefined;
    const dateStr =
      deadline?.type === 'date'
        ? deadline.date
        : deadline?.type === 'timed'
        ? deadline.timestamp
        : undefined;
    const tzStr = deadline?.type === 'timed' ? deadline.timezone : undefined;
    return {
      headline: 'Create a personal task',
      targetLabel: 'New task',
      before: null,
      after: `Create task “${title}” with status ${String(payload['status'] ?? 'todo')}.`,
      destination: 'Plan / Tasks',
      date: dateStr,
      timezone: tzStr,
      source: 'Assistant proposal',
    };
  }
  if (operation === 'create_personal_note') {
    const title = String(payload['title'] ?? 'Untitled note');
    return {
      headline: 'Create a personal note',
      targetLabel: 'New note',
      before: null,
      after: `Create note “${title}”.`,
      destination: 'Library / Notes',
      source: 'Assistant proposal',
    };
  }
  if (operation === 'create_personal_journal_entry') {
    const title = payload['title'] ? String(payload['title']) : null;
    const entryDate = String(payload['entryDate'] ?? 'today');
    const timezone = String(payload['timezone'] ?? 'UTC');
    return {
      headline: 'Create a personal journal entry',
      targetLabel: title ? `Journal: “${title}”` : `Journal entry (${entryDate})`,
      before: null,
      after: `Create journal entry for ${entryDate}${title ? ` titled “${title}”` : ''} in timezone ${timezone}.`,
      destination: 'Journal',
      date: entryDate,
      timezone,
      source: 'Assistant proposal',
    };
  }
  const title = String(payload['title'] ?? target?.title ?? 'task');
  return {
    headline: 'Update a personal task',
    targetLabel: target?.beforeLabel ?? 'Existing task',
    before: target?.beforeLabel ?? null,
    after: `Update to title “${title}”${
      payload['status'] !== undefined ? `, status ${String(payload['status'])}` : ''
    }.`,
    destination: 'Plan / Tasks',
    source: 'Assistant proposal',
  };
}

async function loadProposalReceiptFromOperation(
  client: PoolClient,
  userId: string,
  operationId: string,
  requestHash: string
): Promise<Record<string, unknown> | null> {
  const receipt = await getMutationReceipt(client, userId, AI_DEVICE_ID, operationId);
  if (!receipt) return null;
  if (receipt.canonicalPayloadHash !== requestHash) {
    throw new AiServiceError(
      'Proposal operation identity mismatch',
      409,
      'AI_OPERATION_HASH_MISMATCH'
    );
  }
  return {
    kind: receipt.entityType === 'item' ? (receipt.resultPayload?.['kind'] ?? 'item') : 'item',
    id: receipt.entityId,
    revision: receipt.acceptedRevision,
    seq: receipt.appliedChangeSeq,
    recovered: true,
    operationId,
  };
}

async function itemExists(
  client: PoolClient,
  workspaceId: string,
  itemId: string,
  kind: string
): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = $3 AND deleted_at IS NULL`,
    [workspaceId, itemId, kind]
  );
  return res.rows.length > 0;
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
  await assertPersonalEditorAccess(client, input.workspaceId, input.userId);

  if (
    input.operation !== 'create_personal_task' &&
    input.operation !== 'update_personal_task' &&
    input.operation !== 'create_personal_note' &&
    input.operation !== 'create_personal_journal_entry'
  ) {
    throw new AiServiceError('Unsupported AI operation', 400, 'AI_OPERATION_UNSUPPORTED');
  }

  if (input.operation === 'create_personal_journal_entry' && !consent.contentScope.journal) {
    throw new AiServiceError(
      'Journal content scope required for journal proposals',
      403,
      'AI_JOURNAL_SCOPE_REQUIRED'
    );
  }

  const normalized = normalizeProposalPayload(input.operation, input.payload);
  let expectedRevision = input.expectedRevision ?? null;
  let targetMeta: { title?: string; beforeLabel?: string } | null = null;

  if (input.operation === 'update_personal_task') {
    if (!input.targetItemId) {
      throw new AiServiceError('targetItemId required for update', 400, 'AI_PROPOSAL_INVALID');
    }
    const payloadBase = (normalized as { baseRevision?: number }).baseRevision;
    if (
      payloadBase !== undefined &&
      input.expectedRevision !== undefined &&
      payloadBase !== input.expectedRevision
    ) {
      throw new AiServiceError(
        'payload.baseRevision contradicts expectedRevision',
        400,
        'AI_REVISION_MISMATCH'
      );
    }
    const rev = input.expectedRevision ?? payloadBase;
    if (rev === undefined) {
      throw new AiServiceError('expectedRevision required for update', 400, 'AI_PROPOSAL_INVALID');
    }
    expectedRevision = rev;
    (normalized as { baseRevision: number }).baseRevision = rev;
    targetMeta = await validateUpdateTarget(client, {
      workspaceId: input.workspaceId,
      targetItemId: input.targetItemId,
      expectedRevision: rev,
    });
  }

  const operationId = crypto.randomUUID();
  const requestHash = hashRequest({
    operation: input.operation,
    payload: normalized,
    targetItemId: input.targetItemId ?? null,
    expectedRevision,
    workspaceId: input.workspaceId,
  });
  const reviewSummary = buildReviewSummary(input.operation, normalized, targetMeta);
  const token = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + PROPOSAL_TTL_MS);

  const res = await client.query<ProposalRow>(
    `INSERT INTO app.ai_proposals (
       user_id, workspace_id, operation, payload, target_item_id, expected_revision,
       consent_generation, confirmation_token, status, expires_at,
       operation_id, request_hash, review_summary
     ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,'pending',$9,$10,$11,$12::jsonb)
     RETURNING *`,
    [
      input.userId,
      input.workspaceId,
      input.operation,
      JSON.stringify(normalized),
      input.targetItemId ?? null,
      expectedRevision,
      consent.consentGeneration,
      token,
      expires.toISOString(),
      operationId,
      requestHash,
      JSON.stringify(reviewSummary),
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
    selectedSources?: { help?: boolean; notes?: boolean; tasks?: boolean; journal?: boolean };
    signal?: AbortSignal;
  }
) {
  const startConsent = await withUserContext(pool, input.userId, (client) =>
    getAiConsentStatus(client, input.userId)
  );
  if (!startConsent.enabled) {
    throw new AiServiceError('AI consent required', 403, 'AI_CONSENT_REQUIRED');
  }
  const requestGeneration = startConsent.consentGeneration;

  if (input.signal?.aborted) {
    throw new AiServiceError('Ask cancelled', 499, 'AI_ASK_CANCELLED');
  }

  const retrieved = await retrieveAuthorizedAnswer(pool, {
    userId: input.userId,
    workspaceId: input.workspaceId,
    query: input.question,
    limit: input.limit,
    selectedSources: input.selectedSources,
    signal: input.signal,
  });

  if (input.signal?.aborted) {
    // Completed provider work may already have been transmitted; do not persist under a cancel.
    throw new AiServiceError(
      'Ask cancelled after provider work; content already transmitted cannot be recalled',
      499,
      'AI_ASK_CANCELLED'
    );
  }

  return withUserContext(pool, input.userId, async (client) => {
    const consent = await getAiConsentStatus(client, input.userId);
    if (!consent.enabled || consent.consentGeneration !== requestGeneration) {
      throw new AiServiceError(
        'Consent changed during ask — result discarded',
        403,
        'AI_CONSENT_CHANGED'
      );
    }
    if (input.signal?.aborted) {
      throw new AiServiceError('Ask cancelled', 499, 'AI_ASK_CANCELLED');
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
    let finalAnswer = retrieved.answer;
    if (input.allowSuggestProposal) {
      const trimmedQ = input.question.trim();
      const taskMatch = /^propose\s+task:\s*(.+)$/i.exec(trimmedQ);
      const noteMatch = /^propose\s+note:\s*(.+)$/i.exec(trimmedQ);
      const journalMatch = /^propose\s+journal:\s*(.+)$/i.exec(trimmedQ);

      if (taskMatch) {
        suggestedProposal = await createAiProposal(client, {
          userId: input.userId,
          workspaceId: input.workspaceId,
          operation: 'create_personal_task',
          payload: {
            title: taskMatch[1]!.slice(0, 200),
            details: `Suggested from assistant turn ${turn.rows[0]!.id}`,
            priority: 'normal',
            status: 'todo',
          },
        });
      } else if (noteMatch) {
        suggestedProposal = await createAiProposal(client, {
          userId: input.userId,
          workspaceId: input.workspaceId,
          operation: 'create_personal_note',
          payload: {
            title: noteMatch[1]!.slice(0, 200),
            plainText: `Note draft from assistant turn ${turn.rows[0]!.id}`,
          },
        });
      } else if (journalMatch) {
        const journalContent = journalMatch[1]!;
        const dateCheck = detectJournalDateAmbiguity(journalContent);
        if (dateCheck.isAmbiguous) {
          finalAnswer = `${retrieved.answer}\n\n${dateCheck.clarificationQuestion}`;
        } else if (dateCheck.inferredDate && consent.contentScope.journal) {
          suggestedProposal = await createAiProposal(client, {
            userId: input.userId,
            workspaceId: input.workspaceId,
            operation: 'create_personal_journal_entry',
            payload: {
              entryDate: dateCheck.inferredDate,
              plainText: sanitizeOrganizerText(journalContent),
              timezone: 'UTC',
            },
          });
        }
      }
    }

    return {
      turnId: turn.rows[0]!.id,
      answer: finalAnswer,
      abstained: retrieved.abstained,
      citations: retrieved.citations,
      retrievedSourceCount: retrieved.retrievedSourceCount,
      providerMode: retrieved.providerMode,
      tokensReserved: retrieved.tokensReserved,
      tokensSettled: retrieved.tokensSettled,
      suggestedProposal,
      label: 'provisional-local-fake-or-gated' as const,
      cancelled: false,
    };
  });
}

export async function listAssistantHistory(
  client: PoolClient,
  userId: string,
  workspaceId: string
) {
  const consent = await getAiConsentStatus(client, userId);
  if (!consent.enabled) {
    throw new AiServiceError('AI consent required', 403, 'AI_CONSENT_REQUIRED');
  }
  // Policy: only current consent generation — prior generations are not relabeled.
  const res = await client.query<{
    id: string;
    workspace_id: string;
    question: string;
    answer: string;
    abstained: boolean;
    citations: unknown;
    provider_mode: string;
    consent_generation: number;
    created_at: Date;
    expires_at: Date;
  }>(
    `SELECT id, workspace_id, question, answer, abstained, citations, provider_mode,
            consent_generation, created_at, expires_at
     FROM app.ai_assistant_turns
     WHERE user_id = $1 AND workspace_id = $2 AND expires_at > now()
       AND question <> ''
       AND consent_generation = $3
     ORDER BY created_at DESC
     LIMIT $4`,
    [userId, workspaceId, consent.consentGeneration, HISTORY_LIMIT]
  );
  return res.rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    question: r.question,
    answer: r.answer,
    abstained: r.abstained,
    citations: Array.isArray(r.citations) ? r.citations : [],
    providerMode: r.provider_mode,
    consentGeneration: Number(r.consent_generation),
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
  }));
}

export async function getAssistantDraft(
  client: PoolClient,
  input: { userId: string; workspaceId: string }
) {
  const consent = await getAiConsentStatus(client, input.userId);
  if (!consent.enabled) {
    return null;
  }
  const res = await client.query<{
    workspace_id: string;
    draft_question: string;
    consent_generation: number;
    created_at: Date;
  }>(
    `SELECT workspace_id, draft_question, consent_generation, created_at
     FROM app.ai_assistant_turns
     WHERE user_id = $1 AND workspace_id = $2 AND draft_question IS NOT NULL
       AND question = ''
       AND consent_generation = $3
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.userId, input.workspaceId, consent.consentGeneration]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    draftQuestion: row.draft_question,
    consentGeneration: Number(row.consent_generation),
    updatedAt: row.created_at.toISOString(),
  };
}

export async function saveAssistantDraft(
  client: PoolClient,
  input: { userId: string; workspaceId: string; draftQuestion: string }
) {
  const consent = await getAiConsentStatus(client, input.userId);
  if (!consent.enabled) {
    throw new AiServiceError('AI consent required', 403, 'AI_CONSENT_REQUIRED');
  }
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
       SET draft_question = $2, consent_generation = $3, expires_at = now() + interval '30 days',
           created_at = now()
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

export async function clearAssistantDraft(
  client: PoolClient,
  input: { userId: string; workspaceId: string }
): Promise<void> {
  await client.query(
    `DELETE FROM app.ai_assistant_turns
     WHERE user_id = $1 AND workspace_id = $2 AND draft_question IS NOT NULL AND question = ''`,
    [input.userId, input.workspaceId]
  );
}

export async function resolveAiSourceAccess(
  client: PoolClient,
  input: { userId: string; workspaceId: string; itemId: string }
) {
  const consent = await getAiConsentStatus(client, input.userId);
  if (!consent.enabled) {
    return {
      accessible: false,
      itemId: input.itemId,
      kind: null,
      title: null,
      revision: null,
      reason: 'AI_CONSENT_REQUIRED',
    };
  }

  if (input.itemId.startsWith('help:')) {
    const articleId = input.itemId.replace(/^help:/, '');
    const article = findHelpArticle(articleId);
    if (!article) {
      return {
        accessible: false,
        itemId: input.itemId,
        kind: 'help',
        title: null,
        revision: null,
        reason: 'SOURCE_NOT_FOUND',
      };
    }
    return {
      accessible: true,
      itemId: input.itemId,
      kind: 'help',
      title: article.title.defaultText,
      revision: article.contentVersion,
      reason: null,
      deepLink: `/help?article=${encodeURIComponent(article.id)}`,
    };
  }

  await assertPersonalEditorAccess(client, input.workspaceId, input.userId);
  const item = await client.query<{
    kind: string;
    revision: number;
    security_scope: string;
    deleted_at: Date | null;
  }>(
    `SELECT kind, revision, security_scope, deleted_at
     FROM app.items WHERE workspace_id = $1 AND id = $2`,
    [input.workspaceId, input.itemId]
  );
  const row = item.rows[0];
  if (!row || row.deleted_at) {
    return {
      accessible: false,
      itemId: input.itemId,
      kind: null,
      title: null,
      revision: null,
      reason: 'SOURCE_NOT_FOUND',
    };
  }
  if (row.security_scope === 'vault') {
    return {
      accessible: false,
      itemId: input.itemId,
      kind: row.kind,
      title: null,
      revision: Number(row.revision),
      reason: 'AI_VAULT_FORBIDDEN',
    };
  }
  let title: string | null = null;
  if (row.kind === 'task') {
    try {
      title = (await getTask(client, input.workspaceId, input.itemId)).title;
    } catch {
      title = null;
    }
  } else if (row.kind === 'note') {
    try {
      title = (await getNote(client, input.workspaceId, input.itemId)).title;
    } catch {
      title = null;
    }
  }
  const indexed = await client.query(
    `SELECT 1 FROM app.ai_index_chunks
     WHERE owner_user_id = $1 AND workspace_id = $2 AND source_item_id = $3
     LIMIT 1`,
    [input.userId, input.workspaceId, input.itemId]
  );
  if (indexed.rows.length === 0) {
    return {
      accessible: false,
      itemId: input.itemId,
      kind: row.kind,
      title,
      revision: Number(row.revision),
      reason: 'SOURCE_NOT_INDEXED',
    };
  }

  let deepLink: string | undefined = undefined;
  if (row.kind === 'task' || row.kind === 'todo') {
    deepLink = `/plan?targetId=${encodeURIComponent(input.itemId)}&targetType=task`;
  } else if (row.kind === 'journal_entry' || row.kind === 'journal') {
    deepLink = `/journal?entryId=${encodeURIComponent(input.itemId)}`;
  } else {
    deepLink = `/library?noteId=${encodeURIComponent(input.itemId)}`;
  }

  return {
    accessible: true,
    itemId: input.itemId,
    kind: row.kind,
    title,
    revision: Number(row.revision),
    reason: null,
    deepLink,
  };
}

export async function deleteAssistantHistory(
  client: PoolClient,
  input: { userId: string; workspaceId: string; turnId?: string }
): Promise<{ deletedTurns: number }> {
  const consent = await getAiConsentStatus(client, input.userId);
  if (!consent.enabled) {
    throw new AiServiceError('AI consent required', 403, 'AI_CONSENT_REQUIRED');
  }
  await assertPersonalEditorAccess(client, input.workspaceId, input.userId);

  let query = `DELETE FROM app.ai_assistant_turns WHERE user_id = $1 AND workspace_id = $2`;
  const params: unknown[] = [input.userId, input.workspaceId];
  if (input.turnId) {
    query += ` AND id = $3`;
    params.push(input.turnId);
  }
  const res = await client.query(query, params);
  return { deletedTurns: res.rowCount ?? 0 };
}

export type AssistantStreamCallbacks = {
  onStart: (event: { turnId: string; providerMode: string; label: string }) => Promise<void> | void;
  onContext: (event: { retrievedSourceCount: number; citations: AiCitation[] }) => Promise<void> | void;
  onChunk: (event: { text: string }) => Promise<void> | void;
  onDone: (event: {
    turnId: string;
    answer: string;
    abstained: boolean;
    citations: AiCitation[];
    tokensReserved: number;
    tokensSettled: number;
  }) => Promise<void> | void;
  onError: (event: { code: string; message: string }) => Promise<void> | void;
};

export async function streamAssistant(
  pool: Pool,
  input: {
    userId: string;
    workspaceId: string;
    question: string;
    limit?: number;
    selectedSources?: { help?: boolean; notes?: boolean; tasks?: boolean; journal?: boolean };
    signal?: AbortSignal;
  },
  callbacks: AssistantStreamCallbacks
): Promise<void> {
  const turnId = crypto.randomUUID();
  try {
    const startConsent = await withUserContext(pool, input.userId, (client) =>
      getAiConsentStatus(client, input.userId)
    );
    if (!startConsent.enabled) {
      throw new AiServiceError('AI consent required', 403, 'AI_CONSENT_REQUIRED');
    }
    const requestGeneration = startConsent.consentGeneration;

    if (input.signal?.aborted) {
      throw new AiServiceError('Ask cancelled', 499, 'AI_ASK_CANCELLED');
    }

    const providerMode = resolveAiProvider(process.env).mode === 'live' ? 'live' : 'fake';
    await callbacks.onStart({
      turnId,
      providerMode,
      label: 'provisional-local-fake-or-gated',
    });

    const retrieved = await retrieveAuthorizedAnswer(pool, {
      userId: input.userId,
      workspaceId: input.workspaceId,
      query: input.question,
      limit: input.limit,
      selectedSources: input.selectedSources,
      signal: input.signal,
      onContext: async (ctx) => {
        await callbacks.onContext({
          retrievedSourceCount: ctx.retrievedSourceCount,
          citations: ctx.citations,
        });
      },
      onChunk: async (chunk) => {
        await callbacks.onChunk({ text: chunk });
      },
    });

    if (input.signal?.aborted) {
      throw new AiServiceError(
        'Ask cancelled after provider work; content already transmitted cannot be recalled',
        499,
        'AI_ASK_CANCELLED'
      );
    }

    await withUserContext(pool, input.userId, async (client) => {
      const consent = await getAiConsentStatus(client, input.userId);
      if (!consent.enabled || consent.consentGeneration !== requestGeneration) {
        throw new AiServiceError(
          'Consent changed during ask — result discarded',
          403,
          'AI_CONSENT_CHANGED'
        );
      }
      if (input.signal?.aborted) {
        throw new AiServiceError('Ask cancelled', 499, 'AI_ASK_CANCELLED');
      }

      await client.query(
        `INSERT INTO app.ai_assistant_turns (
           id, user_id, workspace_id, consent_generation, question, answer, abstained,
           citations, provider_mode
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [
          turnId,
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
    });

    await callbacks.onDone({
      turnId,
      answer: retrieved.answer,
      abstained: retrieved.abstained,
      citations: retrieved.citations,
      tokensReserved: retrieved.tokensReserved,
      tokensSettled: retrieved.tokensSettled,
    });
  } catch (err) {
    const code =
      err instanceof AiServiceError
        ? err.code
        : err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : 'AI_PROVIDER_ERROR';
    const message = err instanceof Error ? err.message : String(err);
    await callbacks.onError({ code, message });
  }
}

export async function updateAiProposalPayload(
  client: PoolClient,
  input: {
    userId: string;
    proposalId: string;
    payload: Record<string, unknown>;
  }
): Promise<AiProposal> {
  const locked = await client.query<ProposalRow>(
    `SELECT * FROM app.ai_proposals WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [input.proposalId, input.userId]
  );
  const row = locked.rows[0];
  if (!row) {
    throw new AiServiceError('Proposal not found', 404, 'AI_PROPOSAL_NOT_FOUND');
  }

  if (row.status !== 'pending') {
    throw new AiServiceError(`Proposal is ${row.status}`, 409, 'AI_PROPOSAL_NOT_PENDING');
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await client.query<ProposalRow>(
      `UPDATE app.ai_proposals SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
      [input.proposalId]
    );
    throw new AiServiceError('Proposal expired', 409, 'AI_PROPOSAL_EXPIRED');
  }

  const consent = await getAiConsentStatus(client, input.userId);
  if (!consent.enabled || consent.consentGeneration !== Number(row.consent_generation)) {
    await client.query<ProposalRow>(
      `UPDATE app.ai_proposals
       SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [input.proposalId]
    );
    throw new AiServiceError('Consent changed — proposal invalidated', 403, 'AI_CONSENT_CHANGED');
  }

  await assertPersonalEditorAccess(client, row.workspace_id, input.userId);

  if (row.operation === 'create_personal_journal_entry' && !consent.contentScope.journal) {
    throw new AiServiceError(
      'Journal content scope required for journal proposals',
      403,
      'AI_JOURNAL_SCOPE_REQUIRED'
    );
  }

  const currentPayload = row.payload as Record<string, unknown>;
  const mergedPayload = {
    ...input.payload,
    id: currentPayload['id'] ?? input.payload['id'] ?? crypto.randomUUID(),
  };

  const normalized = normalizeProposalPayload(row.operation as AiAssistantOperation, mergedPayload);

  let targetMeta: { title?: string; beforeLabel?: string } | null = null;
  if (row.operation === 'update_personal_task' && row.target_item_id && row.expected_revision !== null) {
    targetMeta = await validateUpdateTarget(client, {
      workspaceId: row.workspace_id,
      targetItemId: row.target_item_id,
      expectedRevision: Number(row.expected_revision),
    });
  }

  const requestHash = hashRequest({
    operation: row.operation,
    payload: normalized,
    targetItemId: row.target_item_id,
    expectedRevision: row.expected_revision === null ? null : Number(row.expected_revision),
    workspaceId: row.workspace_id,
  });

  const reviewSummary = buildReviewSummary(row.operation as AiAssistantOperation, normalized, targetMeta);
  const newToken = crypto.randomBytes(24).toString('base64url');

  const res = await client.query<ProposalRow>(
    `UPDATE app.ai_proposals
     SET payload = $2::jsonb,
         request_hash = $3,
         review_summary = $4::jsonb,
         confirmation_token = $5,
         updated_at = now()
     WHERE id = $1 AND user_id = $6 AND status = 'pending'
     RETURNING *`,
    [
      input.proposalId,
      JSON.stringify(normalized),
      requestHash,
      JSON.stringify(reviewSummary),
      newToken,
      input.userId,
    ]
  );

  if (res.rows.length === 0) {
    throw new AiServiceError('Proposal update failed', 409, 'AI_PROPOSAL_NOT_PENDING');
  }

  return mapProposal(res.rows[0]!);
}

export async function cancelAiProposal(
  client: PoolClient,
  input: { userId: string; proposalId: string }
): Promise<AiProposal> {
  const res = await client.query<ProposalRow>(
    `UPDATE app.ai_proposals
     SET status = 'cancelled', cancelled_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [input.proposalId, input.userId]
  );
  if (res.rows.length === 0) {
    const existing = await client.query<ProposalRow>(
      `SELECT * FROM app.ai_proposals WHERE id = $1 AND user_id = $2`,
      [input.proposalId, input.userId]
    );
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
): Promise<ConfirmAiProposalResult> {
  const locked = await client.query<ProposalRow>(
    `SELECT * FROM app.ai_proposals WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [input.proposalId, input.userId]
  );
  const row = locked.rows[0];
  if (!row) {
    throw new AiServiceError('Proposal not found', 404, 'AI_PROPOSAL_NOT_FOUND');
  }

  if (row.status === 'confirmed') {
    if (row.confirmation_token !== input.confirmationToken) {
      throw new AiServiceError('Confirmation token mismatch', 409, 'AI_CONFIRM_MISMATCH');
    }
    return { outcome: 'ok', proposal: mapProposal(row) };
  }

  if (row.status !== 'pending') {
    return {
      outcome: 'error',
      proposal: mapProposal(row),
      error: new AiServiceError(`Proposal is ${row.status}`, 409, 'AI_PROPOSAL_NOT_PENDING'),
    };
  }
  if (row.confirmation_token !== input.confirmationToken) {
    throw new AiServiceError('Confirmation token mismatch', 409, 'AI_CONFIRM_MISMATCH');
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    const expired = await client.query<ProposalRow>(
      `UPDATE app.ai_proposals SET status = 'expired' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [input.proposalId]
    );
    return {
      outcome: 'error',
      proposal: mapProposal(expired.rows[0] ?? { ...row, status: 'expired' }),
      error: new AiServiceError('Proposal expired', 409, 'AI_PROPOSAL_EXPIRED'),
    };
  }

  const consent = await getAiConsentStatus(client, input.userId);
  if (!consent.enabled || consent.consentGeneration !== Number(row.consent_generation)) {
    const cancelled = await client.query<ProposalRow>(
      `UPDATE app.ai_proposals
       SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [input.proposalId]
    );
    return {
      outcome: 'error',
      proposal: mapProposal(cancelled.rows[0] ?? { ...row, status: 'cancelled' }),
      error: new AiServiceError('Consent changed — proposal invalidated', 403, 'AI_CONSENT_CHANGED'),
    };
  }

  if (row.operation === 'create_personal_journal_entry' && !consent.contentScope.journal) {
    const cancelled = await client.query<ProposalRow>(
      `UPDATE app.ai_proposals
       SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [input.proposalId]
    );
    return {
      outcome: 'error',
      proposal: mapProposal(cancelled.rows[0] ?? { ...row, status: 'cancelled' }),
      error: new AiServiceError(
        'Journal content scope required for journal proposals',
        403,
        'AI_JOURNAL_SCOPE_REQUIRED'
      ),
    };
  }

  try {
    await assertPersonalEditorAccess(client, row.workspace_id, input.userId);
  } catch (err) {
    const cancelled = await client.query<ProposalRow>(
      `UPDATE app.ai_proposals
       SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [input.proposalId]
    );
    return {
      outcome: 'error',
      proposal: mapProposal(cancelled.rows[0] ?? { ...row, status: 'cancelled' }),
      error:
        err instanceof AiServiceError
          ? err
          : new AiServiceError('Workspace access revoked', 403, 'AI_SCOPE_FORBIDDEN'),
    };
  }

  await client.query("SELECT set_config('app.current_workspace_id', $1, true);", [
    row.workspace_id,
  ]);

  // Stored payload is authoritative; confirm body cannot substitute arguments.
  const payload = normalizeProposalPayload(
    row.operation as AiAssistantOperation,
    row.payload as Record<string, unknown>
  );
  const requestHash = String(row.request_hash);

  let receipt: Record<string, unknown>;
  await client.query('SAVEPOINT ai_proposal_exec');
  try {
    if (
      row.operation === 'create_personal_task' ||
      row.operation === 'create_personal_note' ||
      row.operation === 'create_personal_journal_entry'
    ) {
      const kind =
        row.operation === 'create_personal_task'
          ? 'task'
          : row.operation === 'create_personal_journal_entry'
            ? 'journal_entry'
            : 'note';
      const createId = String((payload as { id: string }).id);
      const fromOp = await loadProposalReceiptFromOperation(
        client,
        input.userId,
        row.operation_id,
        requestHash
      );
      if (fromOp) {
        receipt = fromOp;
      } else if (await itemExists(client, row.workspace_id, createId, kind)) {
        throw new AiServiceError(
          'Create id already exists and is not bound to this proposal',
          409,
          'AI_CREATE_ID_CONFLICT'
        );
      } else if (row.operation === 'create_personal_task') {
        const created = await createTask(
          client,
          row.workspace_id,
          input.userId,
          payload as never,
          row.operation_id
        );
        const deepLink = getOrganizerDeepLink('task', created.id);
        receipt = {
          kind: 'task',
          id: created.id,
          revision: created.revision,
          seq: created.seq,
          operationId: row.operation_id,
          deepLink,
        };
        await insertMutationReceipt(client, {
          workspaceId: row.workspace_id,
          actorUserId: input.userId,
          deviceId: AI_DEVICE_ID,
          operationId: row.operation_id,
          command: 'aiConfirmCreateTask',
          entityType: 'item',
          entityId: created.id,
          schemaVersion: 1,
          baseRevision: 0,
          canonicalPayloadHash: requestHash,
          status: 'accepted',
          acceptedRevision: created.revision,
          appliedChangeSeq: created.seq,
          resultPayload: { kind: 'task', id: created.id, revision: created.revision, deepLink },
        });
      } else if (row.operation === 'create_personal_note') {
        const created = await createNote(
          client,
          row.workspace_id,
          input.userId,
          payload as never,
          row.operation_id
        );
        const deepLink = getOrganizerDeepLink('note', created.id);
        receipt = {
          kind: 'note',
          id: created.id,
          revision: created.revision,
          seq: created.seq,
          operationId: row.operation_id,
          deepLink,
        };
        await insertMutationReceipt(client, {
          workspaceId: row.workspace_id,
          actorUserId: input.userId,
          deviceId: AI_DEVICE_ID,
          operationId: row.operation_id,
          command: 'aiConfirmCreateNote',
          entityType: 'item',
          entityId: created.id,
          schemaVersion: 1,
          baseRevision: 0,
          canonicalPayloadHash: requestHash,
          status: 'accepted',
          acceptedRevision: created.revision,
          appliedChangeSeq: created.seq,
          resultPayload: { kind: 'note', id: created.id, revision: created.revision, deepLink },
        });
      } else {
        const created = await createJournalEntry(
          client,
          row.workspace_id,
          input.userId,
          payload as CreateJournalEntryRequest,
          row.operation_id
        );
        const deepLink = getOrganizerDeepLink('journal_entry', created.id);
        receipt = {
          kind: 'journal_entry',
          id: created.id,
          revision: created.serverRevision,
          seq: created.seq,
          operationId: row.operation_id,
          deepLink,
        };
        await insertMutationReceipt(client, {
          workspaceId: row.workspace_id,
          actorUserId: input.userId,
          deviceId: AI_DEVICE_ID,
          operationId: row.operation_id,
          command: 'aiConfirmCreateJournalEntry',
          entityType: 'item',
          entityId: created.id,
          schemaVersion: 1,
          baseRevision: 0,
          canonicalPayloadHash: requestHash,
          status: 'accepted',
          acceptedRevision: created.serverRevision,
          appliedChangeSeq: created.seq,
          resultPayload: {
            kind: 'journal_entry',
            id: created.id,
            revision: created.serverRevision,
            deepLink,
          },
        });
      }
    } else if (row.operation === 'update_personal_task') {
      if (!row.target_item_id) {
        throw new AiServiceError('Missing target', 400, 'AI_PROPOSAL_INVALID');
      }
      const expected =
        row.expected_revision === null ? undefined : Number(row.expected_revision);
      if (expected === undefined) {
        throw new AiServiceError('Missing expected revision', 400, 'AI_PROPOSAL_INVALID');
      }
      await validateUpdateTarget(client, {
        workspaceId: row.workspace_id,
        targetItemId: row.target_item_id,
        expectedRevision: expected,
      });
      const updatePayload = {
        ...(payload as Record<string, unknown>),
        baseRevision: expected,
      };
      const updated = await updateTask(
        client,
        row.workspace_id,
        row.target_item_id,
        input.userId,
        updatePayload as never
      );
      receipt = {
        kind: 'task',
        id: updated.id,
        revision: updated.revision,
        seq: updated.seq,
        operationId: row.operation_id,
        deepLink: getOrganizerDeepLink('task', updated.id),
      };
    } else {
      throw new AiServiceError('Unsupported AI operation', 400, 'AI_OPERATION_UNSUPPORTED');
    }
    await client.query('RELEASE SAVEPOINT ai_proposal_exec');
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT ai_proposal_exec');
    const failed = await client.query<ProposalRow>(
      `UPDATE app.ai_proposals
       SET status = 'failed', execution_receipt = $2::jsonb
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [
        input.proposalId,
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          code: err instanceof AiServiceError ? err.code : 'AI_EXECUTION_FAILED',
        }),
      ]
    );
    return {
      outcome: 'error',
      proposal: mapProposal(failed.rows[0] ?? { ...row, status: 'failed' }),
      error:
        err instanceof AiServiceError
          ? err
          : new AiServiceError(
              err instanceof Error ? err.message : 'Execution failed',
              500,
              'AI_EXECUTION_FAILED'
            ),
    };
  }

  const done = await client.query<ProposalRow>(
    `UPDATE app.ai_proposals
     SET status = 'confirmed', confirmed_at = now(), execution_receipt = $2::jsonb
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [input.proposalId, JSON.stringify(receipt)]
  );
  if (done.rows.length === 0) {
    const again = await client.query<ProposalRow>(`SELECT * FROM app.ai_proposals WHERE id = $1`, [
      input.proposalId,
    ]);
    return { outcome: 'ok', proposal: mapProposal(again.rows[0]!) };
  }
  return { outcome: 'ok', proposal: mapProposal(done.rows[0]!) };
}

export async function batchConfirmAiProposals(
  pool: Pool,
  input: {
    userId: string;
    items: Array<{ proposalId: string; confirmationToken: string }>;
  }
): Promise<
  Array<{
    proposalId: string;
    outcome: 'ok' | 'error';
    proposal: AiProposal;
    error: { code: string; message: string } | null;
  }>
> {
  const results: Array<{
    proposalId: string;
    outcome: 'ok' | 'error';
    proposal: AiProposal;
    error: { code: string; message: string } | null;
  }> = [];

  for (const item of input.items) {
    try {
      const workspaceId = await withUserContext(pool, input.userId, async (client) => {
        const res = await client.query<{ workspace_id: string }>(
          `SELECT workspace_id FROM app.ai_proposals WHERE id = $1 AND user_id = $2`,
          [item.proposalId, input.userId]
        );
        if (!res.rows[0]) {
          throw new AiServiceError('Proposal not found', 404, 'AI_PROPOSAL_NOT_FOUND');
        }
        return res.rows[0].workspace_id;
      });

      const res = await withTenantContext(
        pool,
        { userId: input.userId, workspaceId },
        (client) =>
          confirmAiProposal(client, {
            userId: input.userId,
            proposalId: item.proposalId,
            confirmationToken: item.confirmationToken,
          })
      );

      if (res.outcome === 'error') {
        results.push({
          proposalId: item.proposalId,
          outcome: 'error',
          proposal: res.proposal,
          error: {
            code: res.error.code,
            message: res.error.message,
          },
        });
      } else {
        results.push({
          proposalId: item.proposalId,
          outcome: 'ok',
          proposal: res.proposal,
          error: null,
        });
      }
    } catch (err) {
      let fallbackProposal: AiProposal | null = null;
      try {
        const check = await withUserContext(pool, input.userId, async (client) => {
          const r = await client.query<ProposalRow>(
            `SELECT * FROM app.ai_proposals WHERE id = $1 AND user_id = $2`,
            [item.proposalId, input.userId]
          );
          return r.rows[0] ? mapProposal(r.rows[0]) : null;
        });
        fallbackProposal = check;
      } catch {
        // ignore
      }

      const code = err instanceof AiServiceError ? err.code : 'AI_EXECUTION_FAILED';
      const message = err instanceof Error ? err.message : String(err);

      results.push({
        proposalId: item.proposalId,
        outcome: 'error',
        proposal:
          fallbackProposal ?? {
            id: item.proposalId,
            workspaceId: '00000000-0000-0000-0000-000000000000',
            operation: 'create_personal_task',
            payload: {},
            targetItemId: null,
            expectedRevision: null,
            consentGeneration: 1,
            status: 'failed',
            expiresAt: new Date().toISOString(),
            confirmationToken: item.confirmationToken,
            executionReceipt: null,
            reviewSummary: {
              headline: 'Failed proposal',
              targetLabel: 'Item',
              before: null,
              after: message,
            },
            createdAt: new Date().toISOString(),
          },
        error: { code, message },
      });
    }
  }

  return results;
}

export async function cleanupExpiredAssistantData(
  client: PoolClient,
  userId?: string
): Promise<{ deletedTurns: number; deletedProposals: number }> {
  const res = await client.query<{ deleted_turns: number; deleted_proposals: number }>(
    `SELECT * FROM app.ai_cleanup_expired_assistant_data($1)`,
    [userId ?? null]
  );
  return {
    deletedTurns: Number(res.rows[0]?.deleted_turns ?? 0),
    deletedProposals: Number(res.rows[0]?.deleted_proposals ?? 0),
  };
}

export async function purgeAssistantDataForUser(client: PoolClient, userId: string): Promise<void> {
  await client.query(`DELETE FROM app.ai_proposals WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM app.ai_assistant_turns WHERE user_id = $1`, [userId]);
}
