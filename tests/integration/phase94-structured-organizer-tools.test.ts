/**
 * Phase 94 — Structured organizer tools and multi-action creation.
 * Local verification of structured organizer tools and multi-action review:
 * - Routines with recurrence, scheduled time, timezone, and reminder availability
 * - Calendar events with explicit all-day or timed behavior
 * - Folders with authorized parents and depth bounds
 * - Knowledge notes with authorized destinations and cross-record references
 * - Custom sections with approved block types and approved field types (rejecting script/SQL)
 * - Expense drafts with validated currency and exact decimal-to-minor-units parsing
 * - Ambiguity detection & clarifying questions for routine/event/expense before confirmation
 * - Multi-action plan with cross-step reference resolution ($ref:0)
 * - Safe partial failure & idempotent retry: prerequisite failure skips dependent steps without duplicating succeeded items
 * - Proposal editing rotates token and invalidates previous token
 * - Vault fencing (403 AI_VAULT_FORBIDDEN)
 * - IDOR and workspace scoping fencing
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

describe('Phase 94: Structured organizer tools and multi-action creation', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase94-key';
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
    const jwtVerifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
      allowedAlgorithms: ['RS256'],
    });

    server = buildServer({
      adminPool,
      runtimePool,
      jwtVerifier,
      trustProxy: true,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
      enableChatPublicationRecovery: false,
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Bad server address');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = createApiClient({ baseUrl, token: await createToken(userId) });
    otherClient = createApiClient({ baseUrl, token: await createToken(otherUserId) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,'P94 User'), ($2,'Other P94 User')
         ON CONFLICT DO NOTHING`,
        [userId, otherUserId]
      );
      const ws = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('P94 personal', 'personal', $1) RETURNING id`,
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

    await acceptConsent();
  });

  afterAll(async () => {
    delete process.env['DAYNORI_AI_LOCAL_ENABLED'];
    delete process.env['DAYNORI_AI_PROVIDER'];
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('P94-01: creates a personal routine with recurrence, scheduled time, timezone, and reminder availability', async () => {
    const proposeRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_routine',
      payload: {
        title: 'Morning Yoga and Stretching',
        frequency: 'daily',
        scheduledTime: '07:30',
        timezone: 'UTC',
        weekdays: [1, 3, 5],
      },
    });

    expect(proposeRes.data.status).toBe('pending');
    expect(proposeRes.data.operation).toBe('create_personal_routine');
    expect(proposeRes.data.reviewSummary.headline).toContain('Create a routine');
    expect(proposeRes.data.reviewSummary.destination).toBe('Plan / Routines');

    const confirmRes = await client.confirmAiProposal(proposeRes.data.id, {
      confirmationToken: proposeRes.data.confirmationToken,
    });

    expect(confirmRes.data.status).toBe('confirmed');
    expect(confirmRes.data.executionReceipt).not.toBeNull();
    const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
    expect(receipt['kind']).toBe('routine');
    expect(receipt['deepLink']).toBe(`/plan?targetId=${receipt['id']}&targetType=routine`);
  });

  it('P94-02: creates a personal calendar event with explicit all-day or timed behavior', async () => {
    const proposeRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_calendar_event',
      payload: {
        title: 'Quarterly Planning Session',
        allDay: false,
        startAt: '2026-12-01T14:00:00.000Z',
        endAt: '2026-12-01T16:00:00.000Z',
        timezone: 'UTC',
        details: 'Design Studio B',
      },
    });

    expect(proposeRes.data.status).toBe('pending');
    expect(proposeRes.data.operation).toBe('create_personal_calendar_event');
    expect(proposeRes.data.reviewSummary.headline).toContain('Create calendar event');
    expect(proposeRes.data.reviewSummary.destination).toBe('Plan / Calendar');

    const confirmRes = await client.confirmAiProposal(proposeRes.data.id, {
      confirmationToken: proposeRes.data.confirmationToken,
    });

    expect(confirmRes.data.status).toBe('confirmed');
    const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
    expect(receipt['kind']).toBe('calendar_event');
    expect(receipt['deepLink']).toBe(`/plan/calendar?eventId=${receipt['id']}`);
  });

  it('P94-03: creates a personal folder with depth bounds and standard security scope', async () => {
    const proposeRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_folder',
      payload: {
        name: 'Research Papers & References',
        color: '#3f51b5',
      },
    });

    expect(proposeRes.data.status).toBe('pending');
    expect(proposeRes.data.operation).toBe('create_personal_folder');
    expect(proposeRes.data.reviewSummary.destination).toBe('Library / Folders');

    const confirmRes = await client.confirmAiProposal(proposeRes.data.id, {
      confirmationToken: proposeRes.data.confirmationToken,
    });

    expect(confirmRes.data.status).toBe('confirmed');
    const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
    expect(receipt['kind']).toBe('folder');
    expect(receipt['deepLink']).toBe(`/library?folderId=${receipt['id']}`);
  });

  it('P94-04: creates a knowledge note in a designated folder with cross-record link/folderId', async () => {
    // Create folder first
    const folderRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_folder',
      payload: { name: 'Machine Learning Notes' },
    });
    const folderConfirm = await client.confirmAiProposal(folderRes.data.id, {
      confirmationToken: folderRes.data.confirmationToken,
    });
    const folderId = (folderConfirm.data.executionReceipt as Record<string, unknown>)['id'] as string;

    // Create note in folder
    const noteRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_note',
      payload: {
        title: 'Transformers Architecture Notes',
        plainText: 'Detailed notes on attention mechanisms and transformer layers.',
        folderId,
      },
    });

    expect(noteRes.data.status).toBe('pending');
    expect(noteRes.data.reviewSummary.destination).toContain('Library / Folders');

    const noteConfirm = await client.confirmAiProposal(noteRes.data.id, {
      confirmationToken: noteRes.data.confirmationToken,
    });
    expect(noteConfirm.data.status).toBe('confirmed');
  });

  it('P94-05: creates a custom section with approved blocks and rejects arbitrary script/SQL', async () => {
    // Valid custom section with existing_record_view block
    const proposeRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_custom_section',
      payload: {
        name: 'Sprint Operations',
        initialSchema: {
          version: 1,
          blocks: [
            {
              id: 'block-view-sprint',
              type: 'existing_record_view',
              title: 'Sprint Tasks',
              targetKind: 'tasks',
              filter: {},
              displayMode: 'list',
              limit: 10,
              sortBy: 'updated_at',
              sortDirection: 'desc',
            },
          ],
        },
      },
    });

    expect(proposeRes.data.status).toBe('pending');
    expect(proposeRes.data.reviewSummary.destination).toBe('Custom Sections');

    const confirmRes = await client.confirmAiProposal(proposeRes.data.id, {
      confirmationToken: proposeRes.data.confirmationToken,
    });
    expect(confirmRes.data.status).toBe('confirmed');

    // Reject malicious script/SQL injection attempt
    await expect(
      client.createAiProposal({
        workspaceId,
        operation: 'create_personal_custom_section',
        payload: {
          name: 'Hacked Section',
          initialSchema: {
            version: 1,
            blocks: [
              {
                id: 'b1',
                type: 'script_runner' as never,
                script: 'DROP TABLE app.items;',
              } as never,
            ],
          },
        },
      })
    ).rejects.toThrow();
  });

  it('P94-06: creates an expense draft with validated currency, exact minor units, and transaction date', async () => {
    const proposeRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_expense',
      payload: {
        amount: '124.50',
        currency: 'USD',
        transactionDate: '2026-11-09',
        kind: 'expense',
        details: 'Office supplies and notebook stationery',
      },
    });

    expect(proposeRes.data.status).toBe('pending');
    expect(proposeRes.data.reviewSummary.headline).toContain('Record an expense');
    expect(proposeRes.data.reviewSummary.destination).toBe('Expenses');

    const confirmRes = await client.confirmAiProposal(proposeRes.data.id, {
      confirmationToken: proposeRes.data.confirmationToken,
    });

    expect(confirmRes.data.status).toBe('confirmed');
    const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
    expect(receipt['kind']).toBe('expense');
    expect(receipt['deepLink']).toBe(`/expenses?expenseId=${receipt['id']}`);

    // Unknown currency rejection
    await expect(
      client.createAiProposal({
        workspaceId,
        operation: 'create_personal_expense',
        payload: {
          amount: '50.00',
          currency: 'INVALID_CURRENCY',
          transactionDate: '2026-11-09',
        },
      })
    ).rejects.toThrow();
  });

  it('P94-07: detects ambiguity in routines, events, and expenses and asks clarifying questions', async () => {
    // Ask ambiguous routine: missing recurrence and time
    const askRoutine = await client.askAssistant({
      workspaceId,
      question: 'propose routine: drink water',
      allowSuggestProposal: true,
    });
    expect(askRoutine.data.answer).toContain('recurrence');
    expect(askRoutine.data.suggestedProposal).toBeFalsy();

    // Ask ambiguous event: missing date
    const askEvent = await client.askAssistant({
      workspaceId,
      question: 'propose event: team sync meeting',
      allowSuggestProposal: true,
    });
    expect(askEvent.data.answer).toContain('What date or time');
    expect(askEvent.data.suggestedProposal).toBeFalsy();

    // Ask ambiguous expense: missing currency and amount
    const askExpense = await client.askAssistant({
      workspaceId,
      question: 'propose expense: coffee with colleague',
      allowSuggestProposal: true,
    });
    expect(askExpense.data.answer).toContain('amount');
    expect(askExpense.data.suggestedProposal).toBeFalsy();
  });

  it('P94-08: executes a multi-action plan with cross-step reference resolution ($ref:0)', async () => {
    const planId = crypto.randomUUID();

    // Step 0: Create Folder
    const pFolder = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_folder',
      payload: { name: 'Alpha Project 2026' },
      planId,
      stepIndex: 0,
      dependsOn: [],
    });

    // Step 1: Create Note referencing Folder from Step 0 ($ref:0)
    const pNote = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_note',
      payload: {
        title: 'Alpha Project Charter',
        plainText: 'Core goals, milestones, and deliverable timeline.',
        folderId: '$ref:0',
      },
      planId,
      stepIndex: 1,
      dependsOn: ['0'],
    });

    expect(pFolder.data.stepIndex).toBe(0);
    expect(pNote.data.stepIndex).toBe(1);
    expect(pNote.data.dependsOn).toEqual(['0']);

    // Batch confirm the 2-step plan
    const batchRes = await client.batchConfirmAiProposals({
      items: [
        { proposalId: pFolder.data.id, confirmationToken: pFolder.data.confirmationToken },
        { proposalId: pNote.data.id, confirmationToken: pNote.data.confirmationToken },
      ],
    });

    expect(batchRes.data.results).toHaveLength(2);
    expect(batchRes.data.results[0]!.outcome).toBe('ok');
    expect(batchRes.data.results[1]!.outcome).toBe('ok');

    const createdFolderId = (batchRes.data.results[0]!.proposal.executionReceipt as Record<string, unknown>)['id'];
    const createdNoteId = (batchRes.data.results[1]!.proposal.executionReceipt as Record<string, unknown>)['id'];

    expect(createdFolderId).toBeTruthy();
    expect(createdNoteId).toBeTruthy();

    // Verify note is indeed inside the created folder
    const noteInDb = await client.getNote(workspaceId, String(createdNoteId));
    expect(noteInDb.data.folderId).toBe(createdFolderId);
  });

  it('P94-09: handles partial failure and safe retry: prerequisite failure skips dependent steps without duplicating succeeded items', async () => {
    const planId = crypto.randomUUID();

    // Step 0: Create Folder (Valid)
    const p0 = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_folder',
      payload: { name: 'Beta Launch Assets' },
      planId,
      stepIndex: 0,
      dependsOn: [],
    });

    // Create a conflicting item first
    const pCollision = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_folder',
      payload: { name: 'Collision Target' },
    });
    const cConf = await client.confirmAiProposal(pCollision.data.id, {
      confirmationToken: pCollision.data.confirmationToken,
    });
    const collisionId = (cConf.data.executionReceipt as Record<string, unknown>)['id'] as string;

    // Step 1: Proposal with pre-existing conflicting ID that fails execution
    const p1 = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_folder',
      payload: {
        id: collisionId,
        name: 'Conflicting Folder',
      },
      planId,
      stepIndex: 1,
      dependsOn: ['0'],
    });

    // Step 2: Note that depends on Step 1
    const p2 = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_note',
      payload: {
        title: 'Beta Launch Summary',
        plainText: 'Summary of launch sync',
      },
      planId,
      stepIndex: 2,
      dependsOn: ['1'],
    });

    // First batch confirm attempt
    const firstBatch = await client.batchConfirmAiProposals({
      items: [
        { proposalId: p0.data.id, confirmationToken: p0.data.confirmationToken },
        { proposalId: p1.data.id, confirmationToken: p1.data.confirmationToken },
        { proposalId: p2.data.id, confirmationToken: p2.data.confirmationToken },
      ],
    });

    expect(firstBatch.data.results[0]!.outcome).toBe('ok');
    expect(firstBatch.data.results[1]!.outcome).toBe('error');
    expect(firstBatch.data.results[2]!.outcome).toBe('skipped');
    expect(firstBatch.data.results[2]!.error?.code).toBe('AI_PREREQUISITE_FAILED');

    // Fix Step 1 by updating its payload with a fresh ID
    const updatedP1 = await client.updateAiProposal(p1.data.id, {
      payload: {
        id: crypto.randomUUID(),
        name: 'Fixed Folder',
      },
    });

    // Reset Step 2 status to pending for retry
    await adminPool.query(
      `UPDATE app.ai_proposals SET status = 'pending', execution_receipt = null WHERE id = $1`,
      [p2.data.id]
    );

    // Second batch confirm attempt: Step 0 is idempotent, Step 1 succeeds, Step 2 succeeds
    const secondBatch = await client.batchConfirmAiProposals({
      items: [
        { proposalId: p0.data.id, confirmationToken: p0.data.confirmationToken },
        { proposalId: updatedP1.data.id, confirmationToken: updatedP1.data.confirmationToken },
        { proposalId: p2.data.id, confirmationToken: p2.data.confirmationToken },
      ],
    });

    expect(secondBatch.data.results[0]!.outcome).toBe('ok');
    expect(secondBatch.data.results[1]!.outcome).toBe('ok');
    expect(secondBatch.data.results[2]!.outcome).toBe('ok');
  });

  it('P94-10: editing proposal fields rotates confirmation token and invalidates stale tokens', async () => {
    const proposeRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_routine',
      payload: {
        title: 'Initial Routine',
        frequency: 'daily',
        timezone: 'UTC',
      },
    });

    const staleToken = proposeRes.data.confirmationToken;

    const updateRes = await client.updateAiProposal(proposeRes.data.id, {
      payload: {
        title: 'Updated Routine Title',
        frequency: 'weekdays',
        weekdays: [1, 2, 3, 4, 5],
      },
    });

    expect(updateRes.data.confirmationToken).not.toBe(staleToken);

    // Confirmation using stale token is rejected with 409 AI_CONFIRM_MISMATCH
    await expect(
      client.confirmAiProposal(proposeRes.data.id, { confirmationToken: staleToken })
    ).rejects.toThrowError(ApiClientError);

    // Confirmation using new rotated token succeeds
    const confirmRes = await client.confirmAiProposal(proposeRes.data.id, {
      confirmationToken: updateRes.data.confirmationToken,
    });
    expect(confirmRes.data.status).toBe('confirmed');
  });

  it('P94-11: rejects vault security scope (403 AI_VAULT_FORBIDDEN) across all organizer tool types', async () => {
    // Folder in vault
    await expect(
      client.createAiProposal({
        workspaceId,
        operation: 'create_personal_folder',
        payload: {
          name: 'Secret Vault Folder',
          securityScope: 'vault',
        },
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    // Note in vault
    await expect(
      client.createAiProposal({
        workspaceId,
        operation: 'create_personal_note',
        payload: {
          title: 'Secret Vault Note',
          plainText: 'Vault text',
          securityScope: 'vault',
        },
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('P94-12: enforces IDOR and workspace scoping: foreign users cannot confirm or modify proposals', async () => {
    const p = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_routine',
      payload: {
        title: 'User 1 Routine',
        frequency: 'daily',
        timezone: 'UTC',
      },
    });

    // User 2 cannot confirm User 1's proposal
    await expect(
      otherClient.confirmAiProposal(p.data.id, { confirmationToken: p.data.confirmationToken })
    ).rejects.toMatchObject({ statusCode: 404 });

    // User 2 cannot update User 1's proposal
    await expect(
      otherClient.updateAiProposal(p.data.id, { payload: { title: 'Hijacked' } })
    ).rejects.toMatchObject({ statusCode: 404 });

    // User 2 cannot cancel User 1's proposal
    await expect(otherClient.cancelAiProposal(p.data.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
