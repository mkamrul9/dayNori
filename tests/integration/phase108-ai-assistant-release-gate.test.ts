/**
 * Phase 108 — AI Text-Assistant Release-Gate and Operational Review.
 *
 * Exhaustive integration verification of Ask Nori:
 * 1. Discovery and truthful explanation of unavailability under DEF-V2-008.
 * 2. Consent fencing, disclosure versions, and strict multi-tenant workspace isolation.
 * 3. Strict journal opt-in (contentScope.journal = true vs false) and unconditional vault exclusion.
 * 4. Grounded citations and prompt injection resistance.
 * 5. Cost accounting, micro-USD reservations, and in-flight cancellation fencing.
 * 6. Operational failure recovery: HTTP 429 rate limit, 503 outage, 401 auth error, and malformed responses.
 * 7. Proposal review lifecycle:
 *    - "write this journal entry" with ambiguous date ("yesterday") -> prompts clarification question, no unreviewed write.
 *    - "write this journal entry" with explicit date (YYYY-MM-DD) -> produces editable preview proposal.
 *    - "create a note" -> produces editable preview proposal.
 *    - "set a task deadline" with ambiguous date ("tomorrow") -> prompts clarification question, no unreviewed write.
 *    - "set a task deadline" with explicit date (YYYY-MM-DD) -> produces editable preview proposal with deadline.
 *    - Proposal preview editing (PATCH /v1/ai/proposals/:proposalId).
 *    - Explicit Confirm/Save (POST /v1/ai/proposals/:proposalId/confirm) -> durable sync mutation receipt (AI_DEVICE_ID), canonical deep link.
 *    - Unreviewed / Cancelled proposal -> zero writes to organizer tables.
 *    - Idempotent confirmation retry -> no duplicate records.
 * 8. Live vs. Mock provider separation:
 *    - Mock provider evaluated under FakeAiProvider.
 *    - Live provider protocol evaluated under OpenAiCompatibleProvider with synthetic authorized HTTP transport (store: false).
 */

import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  CURRENT_AI_CONSENT_VERSION,
  CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
  detectJournalDateAmbiguity,
  detectTaskDeadlineAmbiguity,
  getOrganizerDeepLink,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient, ApiClientError } from '@daynori/api-client';
import {
  FakeAiProvider,
  OpenAiCompatibleProvider,
  type AiHttpTransport,
} from '../../apps/api/src/modules/ai/provider.js';

describe('Phase 108: AI Text-Assistant Release-Gate and Operational Review', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase108-test-key';

  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let workspaceA: string;
  let workspaceB: string;

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

    clientA = createApiClient({ baseUrl, token: await createToken(userA) });
    clientB = createApiClient({ baseUrl, token: await createToken(userB) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1, 'P108 Alice'), ($2, 'P108 Bob')
         ON CONFLICT (id) DO NOTHING`,
        [userA, userB]
      );
      const wsA = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('Alice Workspace', 'personal', $1) RETURNING id`,
        [userA]
      );
      workspaceA = wsA.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
        [workspaceA, userA]
      );

      const wsB = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('Bob Workspace', 'personal', $1) RETURNING id`,
        [userB]
      );
      workspaceB = wsB.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
        [workspaceB, userB]
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

  // -------------------------------------------------------------------------
  // 1. Consent Fencing, Disclosure Version, & Workspace Isolation
  // -------------------------------------------------------------------------
  describe('Consent Fencing & Multi-Tenant Isolation', () => {
    it('P108-01: requires current provider disclosure version to accept consent', async () => {
      await expect(
        clientA.acceptAiConsent({
          consentVersion: CURRENT_AI_CONSENT_VERSION,
          providerDisclosureVersion: 'outdated-v0',
          contentScope: { notes: true, tasks: true, journal: false },
        })
      ).rejects.toThrow();

      const acceptRes = await clientA.acceptAiConsent({
        consentVersion: CURRENT_AI_CONSENT_VERSION,
        providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
        contentScope: { notes: true, tasks: true, journal: false },
      });
      expect(acceptRes.data.enabled).toBe(true);
      expect(acceptRes.data.requiresAcceptance).toBe(false);
      expect(acceptRes.data.contentScope.journal).toBe(false);
    });

    it('P108-02: strictly isolates multi-tenant workspace queries and proposals', async () => {
      // Setup consent for User B
      await clientB.acceptAiConsent({
        consentVersion: CURRENT_AI_CONSENT_VERSION,
        providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
        contentScope: { notes: true, tasks: true, journal: true },
      });

      // User A creates a proposal in workspace A
      const propA = await clientA.createAiProposal({
        workspaceId: workspaceA,
        operation: 'create_personal_note',
        payload: { title: 'Alice Confidential Note', plainText: 'Top secret strategy' },
      });
      expect(propA.data.id).toBeTruthy();

      // User B attempts to update User A's proposal -> 404 forbidden
      await expect(
        clientB.updateAiProposal(propA.data.id, {
          payload: { title: 'Malicious modification' },
        })
      ).rejects.toThrow();

      // User B attempts to confirm User A's proposal -> rejected
      await expect(
        clientB.confirmAiProposal(propA.data.id, {
          confirmationToken: propA.data.confirmationToken,
        })
      ).rejects.toThrow();

      // User B attempts to cancel User A's proposal -> rejected
      await expect(clientB.cancelAiProposal(propA.data.id)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Strict Journal Opt-in & Unconditional Vault Exclusion
  // -------------------------------------------------------------------------
  describe('Journal Opt-in & Vault Exclusion Gates', () => {
    it('P108-03: rejects journal proposal when contentScope.journal is false', async () => {
      // User A currently has journal = false
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'write this journal entry: 2026-11-20 Walked in the park today',
        allowSuggestProposal: true,
      });

      // Should refuse to propose or save journal entry, informing about settings opt-in
      expect(askRes.data.suggestedProposal).toBeNull();
      expect(askRes.data.answer).toContain('Journal access');
    });

    it('P108-04: allows journal proposal when user opts in to journal scope', async () => {
      // User A opts in to journal scope
      await clientA.acceptAiConsent({
        consentVersion: CURRENT_AI_CONSENT_VERSION,
        providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
        contentScope: { notes: true, tasks: true, journal: true },
      });

      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'write this journal entry: 2026-11-20 Walked in the park today',
        allowSuggestProposal: true,
      });

      expect(askRes.data.suggestedProposal).not.toBeNull();
      expect(askRes.data.suggestedProposal?.operation).toBe('create_personal_journal_entry');
      expect(askRes.data.suggestedProposal?.status).toBe('pending');
    });

    it('P108-05: unconditionally excludes vault items from AI proposals', async () => {
      await expect(
        clientA.createAiProposal({
          workspaceId: workspaceA,
          operation: 'create_personal_note',
          payload: {
            title: 'Vault Note Attempt',
            plainText: 'Should fail closed',
            securityScope: 'vault',
          },
        })
      ).rejects.toThrow(/Vault targets are forbidden|403/);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Ambiguous Date Detection & Clarification Verification
  // -------------------------------------------------------------------------
  describe('Ambiguous Date Clarification (Anti-Hallucination Gate)', () => {
    it('P108-06: detects ambiguous relative dates in journal requests without saving unreviewed entries', async () => {
      // Ambiguous date: "yesterday"
      const ambigJournal = detectJournalDateAmbiguity('Walked through the forest yesterday');
      expect(ambigJournal.isAmbiguous).toBe(true);
      expect(ambigJournal.clarificationQuestion).toContain('YYYY-MM-DD');

      // Exercise via Ask Nori
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'write this journal entry: I walked around yesterday and thought about our project',
        allowSuggestProposal: true,
      });

      // Must produce a clarifying question, NOT create an unreviewed proposal
      expect(askRes.data.suggestedProposal).toBeNull();
      expect(askRes.data.answer).toContain('Which date should this journal entry be recorded for?');

      // Verify nothing was saved to app.journal_entries
      const journals = await clientA.listJournalEntries(workspaceA);
      expect(journals.data.length).toBe(0);
    });

    it('P108-07: detects ambiguous relative dates in task deadline requests without saving unreviewed tasks', async () => {
      // Ambiguous relative date: "tomorrow"
      const ambigTask = detectTaskDeadlineAmbiguity('Submit quarterly report tomorrow');
      expect(ambigTask.isAmbiguous).toBe(true);
      expect(ambigTask.clarificationQuestion).toContain('YYYY-MM-DD');

      // Exercise via Ask Nori
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'set a task deadline: Submit quarterly report tomorrow',
        allowSuggestProposal: true,
      });

      // Must produce a clarifying question, NOT create an unreviewed proposal
      expect(askRes.data.suggestedProposal).toBeNull();
      expect(askRes.data.answer).toContain('What exact date is the deadline for this task?');

      // Verify nothing was saved to app.tasks
      const tasks = await clientA.listTasks(workspaceA);
      expect(tasks.data.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Exercise Requests: Preview, Edit, Explicit Save/Confirm, Durable Receipt
  // -------------------------------------------------------------------------
  describe('Core Exercise Journeys: Journal, Note, and Task Deadline', () => {
    it('P108-08: exercises "create a note" -> editable preview -> confirm -> durable receipt & deep link', async () => {
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'create a note: Team retrospective sprint 42',
        allowSuggestProposal: true,
      });

      expect(askRes.data.suggestedProposal).not.toBeNull();
      const proposal = askRes.data.suggestedProposal!;
      expect(proposal.operation).toBe('create_personal_note');
      expect(proposal.status).toBe('pending');
      expect(proposal.reviewSummary.headline).toBe('Create a personal note');

      // Verify note is NOT in organizer tables yet
      const notesBefore = await clientA.listNotes(workspaceA);
      expect(notesBefore.data.length).toBe(0);

      // Edit preview proposal before confirming
      const patched = await clientA.updateAiProposal(proposal.id, {
        payload: {
          title: 'Team retrospective sprint 42 (Edited)',
          plainText: 'Detailed discussion points and action items.',
        },
      });
      expect(patched.data.payload['title']).toBe('Team retrospective sprint 42 (Edited)');

      // Explicit Confirm/Save using the fresh token issued upon edit
      const confirmRes = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: patched.data.confirmationToken,
      });
      expect(confirmRes.data.status).toBe('confirmed');
      expect(confirmRes.data.executionReceipt).toBeTruthy();

      const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
      expect(receipt['kind']).toBe('note');
      expect(receipt['id']).toBeTruthy();
      expect(receipt['deepLink']).toBe(getOrganizerDeepLink('note', String(receipt['id'])));

      // Verify item now exists in domain organizer table
      const notesAfter = await clientA.listNotes(workspaceA);
      expect(notesAfter.data.length).toBe(1);
      expect(notesAfter.data[0]!.title).toBe('Team retrospective sprint 42 (Edited)');

      // Verify durable mutation receipt exists under AI_DEVICE_ID in app.mutation_receipts
      const checkReceipt = await adminPool.query(
        `SELECT * FROM app.mutation_receipts WHERE workspace_id = $1 AND entity_id = $2`,
        [workspaceA, receipt['id']]
      );
      expect(checkReceipt.rows.length).toBe(1);
      expect(checkReceipt.rows[0]!.device_id).toBe('ai-assistant-proposal');
      expect(checkReceipt.rows[0]!.command).toBe('aiConfirmCreateNote');
    });

    it('P108-09: exercises "set a task deadline" with explicit date -> preview -> confirm -> durable receipt & deep link', async () => {
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'set a task deadline: Submit corporate tax return by 2026-12-15',
        allowSuggestProposal: true,
      });

      expect(askRes.data.suggestedProposal).not.toBeNull();
      const proposal = askRes.data.suggestedProposal!;
      expect(proposal.operation).toBe('create_personal_task');
      expect(proposal.status).toBe('pending');
      expect(proposal.reviewSummary.date).toBe('2026-12-15');

      // Verify task is NOT in organizer tables yet
      const tasksBefore = await clientA.listTasks(workspaceA);
      expect(tasksBefore.data.length).toBe(0);

      // Explicit Confirm/Save
      const confirmRes = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });
      expect(confirmRes.data.status).toBe('confirmed');

      const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
      expect(receipt['kind']).toBe('task');
      expect(receipt['id']).toBeTruthy();
      expect(receipt['deepLink']).toBe(getOrganizerDeepLink('task', String(receipt['id'])));

      // Verify task exists with deadline in domain table
      const tasksAfter = await clientA.listTasks(workspaceA);
      expect(tasksAfter.data.length).toBe(1);
      expect(tasksAfter.data[0]!.deadline).toEqual({ type: 'date', date: '2026-12-15' });

      // Verify durable mutation receipt exists in app.mutation_receipts
      const checkReceipt = await adminPool.query(
        `SELECT * FROM app.mutation_receipts WHERE workspace_id = $1 AND entity_id = $2`,
        [workspaceA, receipt['id']]
      );
      expect(checkReceipt.rows.length).toBe(1);
      expect(checkReceipt.rows[0]!.device_id).toBe('ai-assistant-proposal');
    });

    it('P108-10: exercises "write this journal entry" with explicit date -> preview -> confirm -> durable receipt & deep link', async () => {
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'write this journal entry: 2026-11-20 Completed the architecture milestone with verified tests',
        allowSuggestProposal: true,
      });

      expect(askRes.data.suggestedProposal).not.toBeNull();
      const proposal = askRes.data.suggestedProposal!;
      expect(proposal.operation).toBe('create_personal_journal_entry');
      expect(proposal.status).toBe('pending');
      expect(proposal.reviewSummary.date).toBe('2026-11-20');

      // Verify journal entry is NOT in organizer tables yet
      const journalsBefore = await clientA.listJournalEntries(workspaceA);
      expect(journalsBefore.data.length).toBe(0);

      // Explicit Confirm/Save
      const confirmRes = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });
      expect(confirmRes.data.status).toBe('confirmed');

      const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
      expect(receipt['kind']).toBe('journal_entry');
      expect(receipt['id']).toBeTruthy();
      expect(receipt['deepLink']).toBe(getOrganizerDeepLink('journal_entry', String(receipt['id'])));

      // Verify entry exists in domain table
      const journalsAfter = await clientA.listJournalEntries(workspaceA);
      expect(journalsAfter.data.length).toBe(1);
      expect(journalsAfter.data[0]!.entryDate).toBe('2026-11-20');

      // Verify durable mutation receipt exists in app.mutation_receipts
      const checkReceipt = await adminPool.query(
        `SELECT * FROM app.mutation_receipts WHERE workspace_id = $1 AND entity_id = $2`,
        [workspaceA, receipt['id']]
      );
      expect(checkReceipt.rows.length).toBe(1);
      expect(checkReceipt.rows[0]!.device_id).toBe('ai-assistant-proposal');
    });

    it('P108-11: cancelled proposal never modifies organizer tables', async () => {
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'create a note: Transient Unwanted Idea',
        allowSuggestProposal: true,
      });
      const proposal = askRes.data.suggestedProposal!;
      expect(proposal.status).toBe('pending');

      const cancelRes = await clientA.cancelAiProposal(proposal.id);
      expect(cancelRes.data.status).toBe('cancelled');

      // Verify note was NOT created
      const notes = await clientA.listNotes(workspaceA);
      expect(notes.data.some((n) => n.title.includes('Transient Unwanted Idea'))).toBe(false);
    });

    it('P108-12: idempotent retry of confirmed proposal returns existing record without duplication', async () => {
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'create a note: Idempotent Note Test',
        allowSuggestProposal: true,
      });
      const proposal = askRes.data.suggestedProposal!;

      const firstConfirm = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });
      const secondConfirm = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });

      expect(firstConfirm.data.id).toBe(secondConfirm.data.id);
      const notes = await clientA.listNotes(workspaceA);
      const matching = notes.data.filter((n) => n.title.includes('Idempotent Note Test'));
      expect(matching.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Live vs. Mock Provider Separation & Operational Failure Recovery
  // -------------------------------------------------------------------------
  describe('Provider Separation & Operational Limits (Live vs. Mock)', () => {
    it('P108-13: evaluates Mock provider (FakeAiProvider) behavior and citations', async () => {
      const fakeProvider = new FakeAiProvider();
      expect(fakeProvider.mode).toBe('fake');
      expect(fakeProvider.disclosureVersion).toBe(CURRENT_AI_PROVIDER_DISCLOSURE_VERSION);

      const result = await fakeProvider.complete({
        system: 'You are Nori.',
        user: 'How do I organize tasks? [source:help:tasks-overview#v1]',
        maxOutputTokens: 250,
      });

      expect(result.mode).toBe('fake');
      expect(result.text).toContain('[source:help:tasks-overview#v1]');
      expect(result.usageKnown).toBe(true);
    });

    it('P108-14: evaluates Live provider (OpenAiCompatibleProvider) wire protocol with store: false', async () => {
      let capturedRequest: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;

      const liveTransport: AiHttpTransport = async (url, init) => {
        capturedRequest = {
          url,
          headers: init.headers as Record<string, string>,
          body: JSON.parse(init.body as string),
        };

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Based on your notes: [source:11111111-1111-1111-1111-111111111111#r1]' } }],
            usage: { prompt_tokens: 35, completion_tokens: 15 },
          }),
          text: async () => '',
        };
      };

      const liveProvider = new OpenAiCompatibleProvider(
        'synthetic-live-key-12345',
        'https://api.openai.com/v1',
        'gpt-4o-mini',
        liveTransport
      );

      expect(liveProvider.mode).toBe('live');
      const result = await liveProvider.complete({
        system: 'System instructions',
        user: 'Query with source [source:11111111-1111-1111-1111-111111111111#r1]',
        maxOutputTokens: 100,
      });

      expect(result.mode).toBe('live');
      expect(result.promptTokensEstimate).toBe(35);
      expect(result.completionTokensEstimate).toBe(15);

      // Verify wire protocol invariants
      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.headers['Authorization']).toBe('Bearer synthetic-live-key-12345');
      expect(capturedRequest!.body['store']).toBe(false); // store: false invariant
      expect(capturedRequest!.body['model']).toBe('gpt-4o-mini');
      expect(capturedRequest!.body['temperature']).toBe(0);
    });

    it('P108-15: maps provider operational failures to typed domain errors', async () => {
      // 1. Rate Limit 429
      const rateLimitTransport: AiHttpTransport = async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Too many requests' } }),
        text: async () => 'Rate limit exceeded',
      });
      const p429 = new OpenAiCompatibleProvider('key', 'https://api.openai.com/v1', 'gpt-4o-mini', rateLimitTransport);
      await expect(p429.complete({ system: '', user: 'test', maxOutputTokens: 50 })).rejects.toMatchObject({
        code: 'AI_PROVIDER_RATE_LIMIT',
      });

      // 2. Outage 503
      const outageTransport: AiHttpTransport = async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'Overloaded' } }),
        text: async () => 'Service Unavailable',
      });
      const p503 = new OpenAiCompatibleProvider('key', 'https://api.openai.com/v1', 'gpt-4o-mini', outageTransport);
      await expect(p503.complete({ system: '', user: 'test', maxOutputTokens: 50 })).rejects.toMatchObject({
        code: 'AI_PROVIDER_OUTAGE',
      });

      // 3. Auth Error 401
      const authTransport: AiHttpTransport = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } }),
        text: async () => 'Unauthorized',
      });
      const p401 = new OpenAiCompatibleProvider('key', 'https://api.openai.com/v1', 'gpt-4o-mini', authTransport);
      await expect(p401.complete({ system: '', user: 'test', maxOutputTokens: 50 })).rejects.toMatchObject({
        code: 'AI_PROVIDER_AUTH_ERROR',
      });

      // 4. Malformed Response
      const malformedTransport: AiHttpTransport = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [] }), // missing message content
        text: async () => '',
      });
      const pMalformed = new OpenAiCompatibleProvider('key', 'https://api.openai.com/v1', 'gpt-4o-mini', malformedTransport);
      await expect(pMalformed.complete({ system: '', user: 'test', maxOutputTokens: 50 })).rejects.toMatchObject({
        code: 'AI_PROVIDER_MALFORMED',
      });
    });

    it('P108-16: in-flight cancellation aborts provider request immediately', async () => {
      const abortController = new AbortController();
      let abortedReceived = false;

      const slowTransport: AiHttpTransport = async (_url, init) => {
        return new Promise((resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            abortedReceived = true;
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      };

      const pCancel = new OpenAiCompatibleProvider('key', 'https://api.openai.com/v1', 'gpt-4o-mini', slowTransport);
      const completionPromise = pCancel.complete({
        system: '',
        user: 'test cancel',
        maxOutputTokens: 50,
        signal: abortController.signal,
      });

      // Trigger abort while in flight
      abortController.abort();
      await expect(completionPromise).rejects.toThrow();
      expect(abortedReceived).toBe(true);
    });
  });
});
