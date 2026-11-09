/**
 * Phase 93 — Reviewed note, task, and journal creation.
 * Local verification of reviewed organizer actions:
 * - Allow-listed typed proposals for notes, tasks, and journals
 * - Proposal payload editing before explicit confirmation
 * - Explicit user confirmation executing domain services and writing durable mutation receipts
 * - Journal date ambiguity detection and clarifying questions (preventing hallucinations)
 * - Journal opt-in content scope enforcement
 * - Batch confirmation across multiple reviewed proposals
 * - Crash-recovery, revision, IDOR, expiry, and vault fencing
 * - Canonical deep links distinguishing local vs persisted cloud state
 */

import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  CURRENT_AI_CONSENT_VERSION,
  CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient, ApiClientError } from '@daynori/api-client';

describe('Phase 93: Reviewed note, task, and journal creation', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase93-key';
  const userId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  let client: DaynoriApiClient;
  let otherClient: DaynoriApiClient;
  let workspaceId: string;
  let otherWorkspaceId: string;

  async function createToken(uid: string): Promise<string> {
    return new SignJWT({
      sub: uid,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);
  }

  async function acceptConsent(opts?: { journal?: boolean }) {
    return client.acceptAiConsent({
      consentVersion: CURRENT_AI_CONSENT_VERSION,
      providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
      contentScope: { notes: true, tasks: true, journal: opts?.journal ?? true },
    });
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_AI_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_AI_PROVIDER'] = 'fake';
    delete process.env['DAYNORI_AI_LIVE_ENABLED'];

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    await new Migrator().migrate();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    const jwks: JSONWebKeySet = { keys: [publicJwk] };

    server = buildServer({
      jwtVerifier: new JwtVerifier({ issuer, audience, localJwks: jwks }),
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
      enableChatPublicationRecovery: false,
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    client = createApiClient({ baseUrl, token: await createToken(userId) });
    otherClient = createApiClient({ baseUrl, token: await createToken(otherUserId) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,'P93 User'), ($2,'Other P93 User')
         ON CONFLICT DO NOTHING`,
        [userId, otherUserId]
      );
      const ws = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('P93 personal', 'personal', $1) RETURNING id`,
        [userId]
      );
      workspaceId = ws.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [workspaceId, userId]
      );

      const ows = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('Other personal', 'personal', $1) RETURNING id`,
        [otherUserId]
      );
      otherWorkspaceId = ows.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [otherWorkspaceId, otherUserId]
      );
    } finally {
      setup.release();
    }
  });

  afterAll(async () => {
    delete process.env['DAYNORI_AI_LOCAL_ENABLED'];
    delete process.env['DAYNORI_AI_PROVIDER'];
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  });

  it('P93-01: creates a personal note through reviewed proposal and explicit confirm', async () => {
    await acceptConsent({ journal: true });

    // Step 1: Create typed proposal
    const proposalRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_note',
      payload: {
        title: 'Meeting Notes: Q4 Review',
        plainText: 'Key deliverables agreed with the design team.',
      },
    });

    const proposal = proposalRes.data;
    expect(proposal.status).toBe('pending');
    expect(proposal.operation).toBe('create_personal_note');
    expect(proposal.reviewSummary.destination).toBe('Library / Notes');
    expect(proposal.reviewSummary.headline).toBe('Create a personal note');
    expect(proposal.confirmationToken).toBeTruthy();

    // Verify item does NOT exist before confirmation
    const noteId = (proposal.payload as { id: string }).id;
    await expect(client.getNote(workspaceId, noteId)).rejects.toThrow();

    // Step 2: Explicit user confirmation
    const confirmRes = await client.confirmAiProposal(proposal.id, {
      confirmationToken: proposal.confirmationToken,
    });

    expect(confirmRes.data.status).toBe('confirmed');
    expect(confirmRes.data.executionReceipt).toMatchObject({
      kind: 'note',
      id: noteId,
      deepLink: `/library?noteId=${encodeURIComponent(noteId)}`,
    });

    // Verify note is persisted and readable in personal workspace
    const noteRes = await client.getNote(workspaceId, noteId);
    expect(noteRes.data.title).toBe('Meeting Notes: Q4 Review');
    expect(noteRes.data.plainText).toBe('Key deliverables agreed with the design team.');
  });

  it('P93-02: creates a personal task through reviewed proposal and explicit confirm', async () => {
    await acceptConsent({ journal: true });

    const proposalRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_task',
      payload: {
        title: 'Draft Quarterly Architecture Report',
        details: 'Include ADR reviews and performance benchmarks.',
        priority: 'high',
        dueDate: '2026-11-15',
        status: 'todo',
      },
    });

    const proposal = proposalRes.data;
    expect(proposal.status).toBe('pending');
    expect(proposal.reviewSummary.destination).toBe('Plan / Tasks');
    expect(proposal.reviewSummary.date).toBe('2026-11-15');

    const taskId = (proposal.payload as { id: string }).id;

    // Confirm proposal
    const confirmRes = await client.confirmAiProposal(proposal.id, {
      confirmationToken: proposal.confirmationToken,
    });

    expect(confirmRes.data.status).toBe('confirmed');
    expect(confirmRes.data.executionReceipt).toMatchObject({
      kind: 'task',
      id: taskId,
      deepLink: `/plan?targetId=${encodeURIComponent(taskId)}&targetType=task`,
    });

    const taskRes = await client.getTask(workspaceId, taskId);
    expect(taskRes.data.title).toBe('Draft Quarterly Architecture Report');
    expect(taskRes.data.priority).toBe('high');
    expect(taskRes.data.deadline).toEqual({ type: 'date', date: '2026-11-15' });
  });

  it('P93-03: creates a personal journal entry through reviewed proposal with date, timezone, and facts', async () => {
    await acceptConsent({ journal: true });

    const proposalRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_journal_entry',
      payload: {
        entryDate: '2026-11-09',
        timezone: 'Asia/Dhaka',
        title: 'Project Milestone Reflection',
        plainText: 'Completed the core sync implementation today. Team morale was strong.',
        mood: 'energized',
      },
    });

    const proposal = proposalRes.data;
    expect(proposal.status).toBe('pending');
    expect(proposal.operation).toBe('create_personal_journal_entry');
    expect(proposal.reviewSummary.destination).toBe('Journal');
    expect(proposal.reviewSummary.date).toBe('2026-11-09');
    expect(proposal.reviewSummary.timezone).toBe('Asia/Dhaka');
    expect(proposal.reviewSummary.headline).toBe('Create a personal journal entry');

    const entryId = (proposal.payload as { id: string }).id;

    // Confirm proposal
    const confirmRes = await client.confirmAiProposal(proposal.id, {
      confirmationToken: proposal.confirmationToken,
    });

    expect(confirmRes.data.status).toBe('confirmed');
    expect(confirmRes.data.executionReceipt).toMatchObject({
      kind: 'journal_entry',
      id: entryId,
      deepLink: `/journal?entryId=${encodeURIComponent(entryId)}`,
    });

    // Check journal entry in DB/API
    const entryRes = await client.getJournalEntry(workspaceId, entryId);
    expect(entryRes.data.entryDate).toBe('2026-11-09');
    expect(entryRes.data.timezone).toBe('Asia/Dhaka');
    expect(entryRes.data.title).toBe('Project Milestone Reflection');
    expect(entryRes.data.plainText).toBe('Completed the core sync implementation today. Team morale was strong.');
  });

  it('P93-04: allows editing proposal fields before confirmation and rotates confirmation token', async () => {
    await acceptConsent({ journal: true });

    // Initial proposal
    const initialRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_task',
      payload: {
        title: 'Rough draft title',
        details: 'Initial notes',
        priority: 'low',
      },
    });

    const initialProposal = initialRes.data;
    const oldToken = initialProposal.confirmationToken;

    // User edits the proposed payload before confirming
    const updatedRes = await client.updateAiProposal(initialProposal.id, {
      payload: {
        title: 'Final Polished Task Title',
        details: 'Reviewed and expanded task details',
        priority: 'high',
      },
    });

    const updatedProposal = updatedRes.data;
    expect(updatedProposal.id).toBe(initialProposal.id);
    expect(updatedProposal.status).toBe('pending');
    expect(updatedProposal.reviewSummary.after).toContain('Final Polished Task Title');
    // Token was rotated
    expect(updatedProposal.confirmationToken).not.toBe(oldToken);

    // Attempting to confirm with old token must be rejected with 409
    await expect(
      client.confirmAiProposal(initialProposal.id, { confirmationToken: oldToken })
    ).rejects.toThrow(ApiClientError);

    // Confirming with the new token executes the edited content
    const confirmRes = await client.confirmAiProposal(initialProposal.id, {
      confirmationToken: updatedProposal.confirmationToken,
    });

    expect(confirmRes.data.status).toBe('confirmed');
    const createdId = (confirmRes.data.executionReceipt as { id: string }).id;
    const taskRes = await client.getTask(workspaceId, createdId);
    expect(taskRes.data.title).toBe('Final Polished Task Title');
    expect(taskRes.data.details).toBe('Reviewed and expanded task details');
    expect(taskRes.data.priority).toBe('high');
  });

  it('P93-05: detects ambiguous journal dates and asks clarifying questions instead of hallucinating dates', async () => {
    await acceptConsent({ journal: true });

    // Asking to propose journal with relative ambiguous date "yesterday"
    const askRes = await client.askAssistant({
      workspaceId,
      question: 'propose journal: yesterday met with team to discuss roadmap',
      allowSuggestProposal: true,
    });

    // Should NOT create a proposal for ambiguous date
    expect(askRes.data.suggestedProposal).toBeNull();
    // Answer must ask for clarification
    expect(askRes.data.answer).toContain('Which date should this journal entry be recorded for');

    // Asking in Bengali with ambiguous relative date "গতকাল"
    const bnAskRes = await client.askAssistant({
      workspaceId,
      question: 'propose journal: গতকাল বন্ধুদের সাথে আড্ডা দিয়েছিলাম',
      allowSuggestProposal: true,
    });

    expect(bnAskRes.data.suggestedProposal).toBeNull();
    expect(bnAskRes.data.answer).toContain('কোন তারিখের জন্য সংরক্ষণ করতে চান');

    // When an unambiguous ISO date is provided:
    const clearAskRes = await client.askAssistant({
      workspaceId,
      question: 'propose journal: 2026-11-09 completed the release milestone successfully',
      allowSuggestProposal: true,
    });

    expect(clearAskRes.data.suggestedProposal).not.toBeNull();
    expect(clearAskRes.data.suggestedProposal?.operation).toBe('create_personal_journal_entry');
    expect(clearAskRes.data.suggestedProposal?.reviewSummary.date).toBe('2026-11-09');
  });

  it('P93-06: rejects journal proposal creation and confirmation if contentScope.journal is disabled', async () => {
    // Accept consent with journal scope EXCLUDED
    await client.acceptAiConsent({
      consentVersion: CURRENT_AI_CONSENT_VERSION,
      providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
      contentScope: { notes: true, tasks: true, journal: false },
    });

    // Proposing journal entry should be rejected with 403
    await expect(
      client.createAiProposal({
        workspaceId,
        operation: 'create_personal_journal_entry',
        payload: {
          entryDate: '2026-11-09',
          plainText: 'Private reflection',
        },
      })
    ).rejects.toThrow(ApiClientError);
  });

  it('P93-07: batch confirms multiple reviewed proposals in one explicit atomic action', async () => {
    await acceptConsent({ journal: true });

    // Create 3 proposals: 1 task, 1 note, 1 journal
    const pTask = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_task',
      payload: { title: 'Batch Task A', status: 'todo' },
    });
    const pNote = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_note',
      payload: { title: 'Batch Note B', plainText: 'Batch content' },
    });
    const pJournal = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_journal_entry',
      payload: { entryDate: '2026-11-09', title: 'Batch Journal C', plainText: 'Batch entry' },
    });

    // Confirm all in one batch
    const batchRes = await client.batchConfirmAiProposals({
      items: [
        { proposalId: pTask.data.id, confirmationToken: pTask.data.confirmationToken },
        { proposalId: pNote.data.id, confirmationToken: pNote.data.confirmationToken },
        { proposalId: pJournal.data.id, confirmationToken: pJournal.data.confirmationToken },
      ],
    });

    expect(batchRes.data.results).toHaveLength(3);
    for (const res of batchRes.data.results) {
      expect(res.outcome).toBe('ok');
      expect(res.error).toBeNull();
      expect(res.proposal.status).toBe('confirmed');
      expect(res.proposal.executionReceipt).toHaveProperty('id');
      expect(res.proposal.executionReceipt).toHaveProperty('deepLink');
    }

    // Verify all 3 created items exist
    const taskId = (pTask.data.payload as { id: string }).id;
    const noteId = (pNote.data.payload as { id: string }).id;
    const journalId = (pJournal.data.payload as { id: string }).id;

    const taskRes = await client.getTask(workspaceId, taskId);
    expect(taskRes.data.title).toBe('Batch Task A');

    const noteRes = await client.getNote(workspaceId, noteId);
    expect(noteRes.data.title).toBe('Batch Note B');

    const journalRes = await client.getJournalEntry(workspaceId, journalId);
    expect(journalRes.data.title).toBe('Batch Journal C');
  });

  it('P93-08: ensures crash-safe idempotent confirmation retry returns the original receipt', async () => {
    await acceptConsent({ journal: true });

    const p = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_note',
      payload: { title: 'Idempotency Test Note', plainText: 'First pass' },
    });

    const confirm1 = await client.confirmAiProposal(p.data.id, {
      confirmationToken: p.data.confirmationToken,
    });
    expect(confirm1.data.status).toBe('confirmed');
    const receipt1 = confirm1.data.executionReceipt;

    // Retry confirm with same token
    const confirm2 = await client.confirmAiProposal(p.data.id, {
      confirmationToken: p.data.confirmationToken,
    });
    expect(confirm2.data.status).toBe('confirmed');
    expect(confirm2.data.executionReceipt).toEqual(receipt1);
  });

  it('P93-09: enforces IDOR fencing across different users and workspaces', async () => {
    await acceptConsent({ journal: true });

    // User A creates a proposal
    const p = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_task',
      payload: { title: 'User A Secret Task' },
    });

    // User B attempts to confirm User A's proposal
    await expect(
      otherClient.confirmAiProposal(p.data.id, {
        confirmationToken: p.data.confirmationToken,
      })
    ).rejects.toThrow(ApiClientError);

    // User B attempts to edit User A's proposal
    await expect(
      otherClient.updateAiProposal(p.data.id, {
        payload: { title: 'Hacked title' },
      })
    ).rejects.toThrow(ApiClientError);

    // User B attempts to cancel User A's proposal
    await expect(otherClient.cancelAiProposal(p.data.id)).rejects.toThrow(ApiClientError);
  });

  it('P93-10: rejects vault scope proposals immediately', async () => {
    await acceptConsent({ journal: true });

    // Note with vault securityScope
    await expect(
      client.createAiProposal({
        workspaceId,
        operation: 'create_personal_note',
        payload: { title: 'Vault Note', securityScope: 'vault' },
      })
    ).rejects.toThrow(ApiClientError);

    // Journal with vault securityScope
    await expect(
      client.createAiProposal({
        workspaceId,
        operation: 'create_personal_journal_entry',
        payload: {
          entryDate: '2026-11-09',
          title: 'Vault Journal',
          securityScope: 'vault',
        },
      })
    ).rejects.toThrow(ApiClientError);
  });

  it('P93-11: preserves exact factual voice for English and Bengali user text', async () => {
    await acceptConsent({ journal: true });

    const bengaliText = 'আজকের মিটিংয়ে আমরা নতুন ফিচার নিয়ে বিস্তারিত আলোচনা করেছি।';
    const p = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_journal_entry',
      payload: {
        entryDate: '2026-11-09',
        title: 'দৈনিক ভাবনা',
        plainText: bengaliText,
      },
    });

    const confirmRes = await client.confirmAiProposal(p.data.id, {
      confirmationToken: p.data.confirmationToken,
    });
    expect(confirmRes.data.status).toBe('confirmed');

    const entryId = (p.data.payload as { id: string }).id;
    const entryRes = await client.getJournalEntry(workspaceId, entryId);
    expect(entryRes.data.title).toBe('দৈনিক ভাবনা');
    expect(entryRes.data.plainText).toBe(bengaliText);
  });
});
